import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM build script without type declarations
import { assertStaticPrerender, HELP_COUNTRY_SLUGS, inlineCriticalCss, packageStaticPublicHtml, SPOT_CRITICAL_CSS_ASSET, SPOT_TEMPLATE_FIXTURE, spotCriticalCss, STATIC_PUBLIC_PAGES } from "../scripts/cf-static-public-html.mjs";
import { HELP_COUNTRIES } from "../lib/help/phrases";
import { BLOG_POSTS } from "../lib/blog/posts";

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
    expect(Object.keys(STATIC_PUBLIC_PAGES)).toEqual(["/", "/pricing", "/help", ...HELP_COUNTRY_SLUGS.map((s: string) => `/help/${s}`),
      ...HELP_COUNTRY_SLUGS.map((s: string) => `/help/${s}/pay`), ...HELP_COUNTRY_SLUGS.map((s: string) => `/help/${s}/open`), ...HELP_COUNTRY_SLUGS.map((s: string) => `/help/${s}/menu`),
      "/blog", ...BLOG_POSTS.map((p) => `/blog/${p.slug}`)]);
    expect(STATIC_PUBLIC_PAGES["/blog/paying-in-seoul"]).toBe("blog/paying-in-seoul.html");
    expect(STATIC_PUBLIC_PAGES["/help/korea/open"]).toBe("help/korea/open.html");
    expect(STATIC_PUBLIC_PAGES["/help/korea/menu"]).toBe("help/korea/menu.html");
    expect(STATIC_PUBLIC_PAGES["/help/japan/pay"]).toBe("help/japan/pay.html");
    expect(STATIC_PUBLIC_PAGES["/help/korea"]).toBe("help/korea.html");
  });

  it("lists every help country page", () => {
    expect(HELP_COUNTRY_SLUGS).toEqual(HELP_COUNTRIES.map((c) => c.slug));
  });

  it("copies the exact prerendered bytes, scripts included", async () => {
    const all = Object.fromEntries(Object.keys(STATIC_PUBLIC_PAGES).map((r) => [r, route(false)]));
    const dir = await buildTree(all);
    expect(await packageStaticPublicHtml(dir)).toEqual(Object.entries(STATIC_PUBLIC_PAGES).map(([r, f]) => `${r} -> ${f}${r === "/" ? " (critical CSS, JS after hero)" : ""}`));
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

  it("home: inlines the used rules and loads every full sheet without blocking the first paint", async () => {
    root = await mkdtemp(path.join(tmpdir(), "critical-css-"));
    const chunks = path.join(root, "_next", "static", "chunks");
    await mkdir(chunks, { recursive: true });
    // Big sheet (> 8 KB): filtered to used rules. Small sheet: inlined whole, even rules on selectors the filter misses.
    const filler = Array.from({ length: 400 }, (_, i) => `.unused-${i}{color:red}`).join("");
    await writeFile(path.join(chunks, "big.css"), `.hero{color:#fff}.not-here{color:red}${filler}`);
    await writeFile(path.join(chunks, "small.css"), "[data-localley-design=borderless]{--ll-raised:1 2 3}.btn{color:blue}");
    const html = '<!DOCTYPE html><html lang="en" data-localley-design="borderless"><head>'
      + '<link rel="stylesheet" href="/_next/static/chunks/big.css" data-precedence="next"/>'
      + '<link rel="stylesheet" href="/_next/static/chunks/small.css" data-precedence="next"/>'
      + '<script src="/_next/static/chunks/a.js" async=""></script></head><body><h1 class="hero">Hi</h1><a class="btn">Go</a>'
      + '<script>self.__next_f.push([1,"x"])</script></body></html>';
    const out: string = await inlineCriticalCss(html, root);
    const style = /<style>([\s\S]*?)<\/style>/.exec(out)?.[1] ?? "";
    expect(style).toContain(".hero{color:#fff}");
    expect(style).not.toContain("not-here");
    expect(style).not.toContain("unused-1");
    expect(style).toContain("--ll-raised:1 2 3");
    const head = out.slice(0, out.indexOf("</head>")).replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    const links = head.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) ?? [];
    expect(links.map((l) => /href="([^"]+)"/.exec(l)?.[1]).sort()).toEqual(["/_next/static/chunks/big.css", "/_next/static/chunks/small.css"]);
    for (const link of links) expect(link).toMatch(/media="print"/);
    expect(out).toContain('self.__next_f.push([1,"x"])');
    expect(out).toMatch(/<script src="\/_next\/static\/chunks\/a\.js" async(="")?><\/script>/);
    expect(out).not.toContain("beasties");
  });

  it("home: a page without stylesheets stays unchanged", async () => {
    expect(await inlineCriticalCss(page, tmpdir())).toBe(page);
  });

  it("spot: critical rules per home stylesheet, matched against the spot template fixture", async () => {
    root = await mkdtemp(path.join(tmpdir(), "spot-critical-"));
    const chunks = path.join(root, "_next", "static", "chunks");
    await mkdir(chunks, { recursive: true });
    const filler = Array.from({ length: 400 }, (_, i) => `.unused-${i}{color:red}`).join("");
    await writeFile(path.join(chunks, "big.css"), `.spot-hero{color:#fff}.home-only{color:red}${filler}`);
    await writeFile(path.join(chunks, "font.css"), "@font-face{font-family:G;src:url(../media/g.woff2)format(\"woff2\")}");
    const home = '<!DOCTYPE html><html><head><link rel="stylesheet" href="/_next/static/chunks/big.css" data-precedence="next"/>'
      + '<link rel="stylesheet" href="/_next/static/chunks/font.css" data-precedence="next"/></head><body class="home-only"></body></html>';
    const template = '<!DOCTYPE html><html><head><link rel="stylesheet" href="/_next/static/chunks/old.css"/></head>'
      + '<body><h1 class="spot-hero">Spot</h1></body></html>';
    const result = await spotCriticalCss(home, template, root);
    expect(Object.keys(result.css)).toEqual(["/_next/static/chunks/big.css", "/_next/static/chunks/font.css"]);
    expect(result.css["/_next/static/chunks/big.css"]).toContain(".spot-hero{color:#fff}");
    expect(result.css["/_next/static/chunks/big.css"]).not.toContain("home-only");
    expect(result.css["/_next/static/chunks/big.css"]).not.toContain("unused-1");
    // Inline CSS resolves url() against the page, so relative font paths must become absolute.
    expect(result.css["/_next/static/chunks/font.css"]).toContain("url(/_next/static/media/g.woff2)");
    expect(await spotCriticalCss(page, template, root)).toBeNull();
  });

  it("spot: the committed template fixture is a real spot page with the hero and stylesheet links", async () => {
    const fixture = await readFile(path.join(process.cwd(), SPOT_TEMPLATE_FIXTURE), "utf8");
    expect(fixture).toMatch(/<link rel="stylesheet" href="\/_next\/static\/chunks\/[^"]+\.css"/);
    expect(fixture).toMatch(/<img\b[^>]*fetchPriority="high"/i);
    expect(fixture).not.toMatch(/<script\b/);
    expect(SPOT_CRITICAL_CSS_ASSET).toBe("_localley/critical-spot.json");
  });
});
