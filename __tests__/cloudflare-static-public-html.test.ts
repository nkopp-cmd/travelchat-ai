import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM build script without type declarations
import { assertStaticPrerender, HELP_COUNTRY_SLUGS, packageStaticPublicHtml, STATIC_PUBLIC_PAGES } from "../scripts/cf-static-public-html.mjs";
import { HELP_COUNTRIES } from "../lib/help/phrases";

const page = '<!DOCTYPE html><html lang="en"><head><script src="/_next/static/chunks/a.js" async=""></script></head><body>Localley</body></html>';
const route = (initialRevalidateSeconds: number | false) => ({ initialRevalidateSeconds, srcRoute: "/" });

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function buildTree(routes: Record<string, unknown>, html = page) {
  root = await mkdtemp(path.join(tmpdir(), "static-html-"));
  await mkdir(path.join(root, ".next", "server", "app"), { recursive: true });
  await mkdir(path.join(root, ".open-next", "assets"), { recursive: true });
  await writeFile(path.join(root, ".next", "prerender-manifest.json"), JSON.stringify({ routes }));
  for (const file of Object.values(STATIC_PUBLIC_PAGES) as string[]) {
    await mkdir(path.dirname(path.join(root, ".next", "server", "app", file)), { recursive: true });
    await writeFile(path.join(root, ".next", "server", "app", file), html);
  }
  return root;
}

describe("static public HTML assets", () => {
  it("covers only the fully static public pages", () => {
    expect(Object.keys(STATIC_PUBLIC_PAGES)).toEqual(["/", "/pricing", "/help", ...HELP_COUNTRY_SLUGS.map((s: string) => `/help/${s}`)]);
    expect(STATIC_PUBLIC_PAGES["/help/korea"]).toBe("help/korea.html");
  });

  it("lists every help country page", () => {
    expect(HELP_COUNTRY_SLUGS).toEqual(HELP_COUNTRIES.map((c) => c.slug));
  });

  it("copies the exact prerendered bytes, scripts included", async () => {
    const all = Object.fromEntries(Object.keys(STATIC_PUBLIC_PAGES).map((r) => [r, route(false)]));
    const dir = await buildTree(all);
    expect(await packageStaticPublicHtml(dir)).toEqual(Object.entries(STATIC_PUBLIC_PAGES).map(([r, f]) => `${r} -> ${f}`));
    for (const file of Object.values(STATIC_PUBLIC_PAGES) as string[]) {
      expect(await readFile(path.join(dir, ".open-next", "assets", file), "utf8")).toBe(page);
    }
  });

  it("refuses a page that revalidates or is not prerendered", async () => {
    const all = Object.fromEntries(Object.keys(STATIC_PUBLIC_PAGES).map((r) => [r, route(false)]));
    await expect(packageStaticPublicHtml(await buildTree({ ...all, "/": route(60) }))).rejects.toThrow(/revalidates/);
    await rm(root!, { recursive: true, force: true });
    await expect(packageStaticPublicHtml(await buildTree({ "/": route(false) }))).rejects.toThrow(/\/pricing is not prerendered/);
  });

  it("refuses incomplete documents and frozen nonces", () => {
    const manifest = { routes: { "/": route(false) } };
    expect(() => assertStaticPrerender("/", manifest, page.slice(0, -7))).toThrow(/incomplete/);
    expect(() => assertStaticPrerender("/", manifest, page.replace("<script ", '<script nonce="abc" '))).toThrow(/nonce/);
  });
});
