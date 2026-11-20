import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { SITEMAPS, changedUrls, parseSitemap, runIndexNow } from "../../scripts/indexnow-changed.mjs";

const H = "https://www.localley.io";
const xml = (rows: [string, string?][]) =>
  `<?xml version="1.0"?><urlset>${rows.map(([loc, mod]) => `<url><loc>${loc}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}</url>`).join("")}</urlset>`;

describe("IndexNow sitemap diff (Push BF4)", () => {
  it("parses loc + lastmod, missing lastmod = empty, entities decoded", () => {
    expect(parseSitemap(xml([[`${H}`], [`${H}/spots?city=seoul&amp;x=1`, "2026-11-20"]]))).toEqual({
      [H]: "", [`${H}/spots?city=seoul&x=1`]: "2026-11-20",
    });
  });

  it("sends new locs and changed lastmods; never unchanged, removed or foreign-host URLs", () => {
    const prev = { [`${H}/a`]: "2026-11-01", [`${H}/b`]: "2026-11-01", [`${H}/gone`]: "2026-11-01", [`${H}`]: "" };
    const next = { [`${H}/a`]: "2026-11-01", [`${H}/b`]: "2026-11-19", [`${H}/new`]: "", [`${H}`]: "", "https://evil.example/x": "" };
    expect(changedUrls(prev, next)).toEqual([`${H}/b`, `${H}/new`]);
    expect(changedUrls(next, next)).toEqual([]);
  });

  describe("runIndexNow", () => {
    let dir = "";
    afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
    const setup = (pages: Record<string, string>) => {
      dir = mkdtempSync(path.join(tmpdir(), "indexnow-"));
      const file = path.join(dir, "state.json");
      const get = vi.fn(async (url: string) => {
        const body = pages[new URL(url).pathname];
        return new Response(body ?? "", { status: body ? 200 : 404 });
      });
      return { file, get };
    };
    const site = (spotMod: string) => Object.fromEntries(SITEMAPS.map((p: string, i: number) =>
      [p, xml([[`${H}/page-${i}`, "2026-11-01"], ...(i === 2 ? [[`${H}/spots/1`, spotMod] as [string, string]] : [])])]));

    it("first run stores a baseline and sends nothing; then only the changed URL, once", async () => {
      const { file, get } = setup(site("2026-11-01"));
      const post = vi.fn(async () => new Response("", { status: 200 }));
      expect(await runIndexNow({ file, get, post })).toMatchObject({ sent: 0, baseline: 4 });
      expect(post).not.toHaveBeenCalled();

      expect(await runIndexNow({ file, get, post })).toMatchObject({ sent: 0, changed: 0 });
      expect(post).not.toHaveBeenCalled();

      const changed = setup(site("2026-11-20"));
      writeFileSync(changed.file, readFileSync(file)); // carry the state over
      expect(await runIndexNow({ file: changed.file, get: changed.get, post })).toMatchObject({ sent: 1, status: 200 });
      expect(post).toHaveBeenCalledTimes(1);
      const body = JSON.parse((post.mock.calls[0] as unknown as [string, { body: string }])[1].body);
      expect(body.urlList).toEqual([`${H}/spots/1`]);
      // Saved after acceptance: the same URL is not sent again.
      expect(await runIndexNow({ file: changed.file, get: changed.get, post })).toMatchObject({ sent: 0, changed: 0 });
      expect(post).toHaveBeenCalledTimes(1);
    });

    it("keeps the old state when IndexNow refuses, and never throws (a release must not fail on it)", async () => {
      const { file, get } = setup(site("2026-11-01"));
      await runIndexNow({ file, get, post: vi.fn() });
      const changed = setup(site("2026-11-20"));
      writeFileSync(changed.file, readFileSync(file));
      const refused = vi.fn(async () => new Response("", { status: 429 }));
      expect(await runIndexNow({ file: changed.file, get: changed.get, post: refused })).toMatchObject({ sent: 1, status: 429 });
      expect(await runIndexNow({ file: changed.file, get: changed.get, post: refused })).toMatchObject({ sent: 1 });

      const broken = setup({});
      expect(await runIndexNow({ file: broken.file, get: broken.get, post: refused })).toMatchObject({ sent: 0, error: expect.stringContaining("404") });
      const thrower = vi.fn(async () => { throw new Error("network down"); });
      expect(await runIndexNow({ file: changed.file, get: changed.get, post: thrower })).toMatchObject({ sent: 0, error: "network down" });
    });

    it("dry run sends and saves nothing", async () => {
      const { file, get } = setup(site("2026-11-01"));
      const post = vi.fn();
      expect(await runIndexNow({ file, get, post, dryRun: true })).toMatchObject({ sent: 0, baseline: 4 });
      expect(() => readFileSync(file)).toThrow();
      expect(post).not.toHaveBeenCalled();
    });
  });
});
