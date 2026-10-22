import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM build script without type declarations
import { assertStaticPrerender, packageStaticPublicHtml, STATIC_PUBLIC_PAGES } from "../scripts/cf-static-public-html.mjs";

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
    await writeFile(path.join(root, ".next", "server", "app", file), html);
  }
  return root;
}

describe("static public HTML assets", () => {
  it("covers only the fully static marketing pages", () => {
    expect(STATIC_PUBLIC_PAGES).toEqual({ "/": "index.html", "/pricing": "pricing.html" });
  });

  it("copies the exact prerendered bytes, scripts included", async () => {
    const dir = await buildTree({ "/": route(false), "/pricing": route(false) });
    expect(await packageStaticPublicHtml(dir)).toEqual(["/ -> index.html", "/pricing -> pricing.html"]);
    expect(await readFile(path.join(dir, ".open-next", "assets", "index.html"), "utf8")).toBe(page);
    expect(await readFile(path.join(dir, ".open-next", "assets", "pricing.html"), "utf8")).toBe(page);
  });

  it("refuses a page that revalidates or is not prerendered", async () => {
    await expect(packageStaticPublicHtml(await buildTree({ "/": route(60), "/pricing": route(false) }))).rejects.toThrow(/revalidates/);
    await rm(root!, { recursive: true, force: true });
    await expect(packageStaticPublicHtml(await buildTree({ "/": route(false) }))).rejects.toThrow(/\/pricing is not prerendered/);
  });

  it("refuses incomplete documents and frozen nonces", () => {
    const manifest = { routes: { "/": route(false) } };
    expect(() => assertStaticPrerender("/", manifest, page.slice(0, -7))).toThrow(/incomplete/);
    expect(() => assertStaticPrerender("/", manifest, page.replace("<script ", '<script nonce="abc" '))).toThrow(/nonce/);
  });
});
