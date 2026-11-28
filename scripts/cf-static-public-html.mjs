// Copies the exact prerendered HTML of fully static public pages into the
// Workers static assets, after `opennextjs-cloudflare build`.
//
// Why: the asset service answers these GETs in every Cloudflare location
// without starting the Worker. Through the Worker, a visit to a quiet location
// (ICN for Korean visitors) misses the per-location edge cache after every
// deploy and then reads the prerender from R2 and the tag cache from D1 far
// away: field TTFB p75 1.6-3.6 s on mobile in Korea (Cloudflare RUM 2026-10-22).
//
// Only pages with `initialRevalidateSeconds: false` qualify: they change only
// on deploy, and the HTML ships in the same asset upload as its hashed chunks.
// The bytes are copied unchanged, scripts included. The one exception is "/"
// (CRITICAL_CSS_PAGES): its render-blocking stylesheets are replaced by inlined
// critical CSS plus async full sheets (inlineCriticalCss below).
import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import Beasties from "beasties";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blogSlugs } from "./blog-index.mjs";
import { deferChunkScripts } from "./cf-defer-scripts.mjs";

// route -> file in .next/server/app and in the asset directory
// ("/pricing" resolves to pricing.html under the default html_handling).
// The planner (/itineraries/new) renders its live city list and revalidates every 5 minutes,
// so it stays on the Worker with the edge HTML cache (cloudflare/opennext/edge-html-cache.ts).
// "Help me say this" phrase cards (app/help): force-static, one page per country in lib/help/phrases.ts.
export const HELP_COUNTRY_SLUGS = ["korea", "japan", "thailand", "vietnam", "taiwan", "singapore"];
export const STATIC_PUBLIC_PAGES = {
  "/": "index.html",
  "/pricing": "pricing.html",
  "/help": "help.html",
  ...Object.fromEntries(HELP_COUNTRY_SLUGS.map((slug) => [`/help/${slug}`, `help/${slug}.html`])),
  ...Object.fromEntries(HELP_COUNTRY_SLUGS.map((slug) => [`/help/${slug}/pay`, `help/${slug}/pay.html`])),
  ...Object.fromEntries(HELP_COUNTRY_SLUGS.map((slug) => [`/help/${slug}/open`, `help/${slug}/open.html`])),
  ...Object.fromEntries(HELP_COUNTRY_SLUGS.map((slug) => [`/help/${slug}/menu`, `help/${slug}/menu.html`])),
  // Journal (app/blog): force-static, one page per content/blog post. The RSS route stays on the Worker.
  "/blog": "blog.html",
  ...Object.fromEntries(blogSlugs().map((slug) => [`/blog/${slug}`, `blog/${slug}.html`])),
  // Push DR3: planner comparison (app/vs/wanderlog), force-static from lib/vs/wanderlog.ts.
  "/vs/wanderlog": "vs/wanderlog.html",
  // Push DT3: itinerary templates (app/templates), a pure prerender of lib/templates.ts (s-maxage=31536000). Through
  // the Worker its edge HIT took 1.0-1.1 s on a cold isolate from ci-1 (2026-11-28).
  "/templates": "templates.html",
};

/**
 * Pages whose HTML gets inlined critical CSS (Push AL3, home LCP). The 25 KB gzip global sheet blocked the first
 * paint for one extra round trip: Lighthouse mobile LCP 2.1 s with the hero image already at fetchpriority high.
 * "/" first (the landing page). Push CI1: the journal posts too; their text LCP equals FCP, and the three blocking sheets
 * (29 KB) held FCP at 1.2 s in PSI mobile on paying-in-singapore. Posts have no hero, so their scripts stay unchanged.
 * Push DJ2: "/pricing" (the checkout page) too; its H1 text LCP equalled FCP at 1205 ms in PSI mobile (3 runs, budget
 * 1200 ms), held by the same three blocking sheets. No hero, so its scripts stay unchanged.
 * Other pages keep the exact bytes.
 * Push DR3: "/vs/wanderlog" too (text LCP, no hero, same blocking sheets).
 */
export const CRITICAL_CSS_PAGES = new Set(["/", "/pricing", ...blogSlugs().map((slug) => `/blog/${slug}`), "/vs/wanderlog"]);

const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/g;
const hrefOf = (tag) => /\bhref="([^"]+)"/.exec(tag)?.[1] ?? null;
const isBlocking = (tag) => !/\bmedia="print"/.test(tag);

/**
 * Inline the CSS rules the page uses and load every full stylesheet without blocking the first paint
 * (media="print" + onload, a <noscript> fallback). Sheets under 8 KB are inlined whole: the rule filter drops the
 * [data-localley-design=borderless] token block on <html>, which left buttons and pills without colours.
 * Every original stylesheet keeps an async <link> with the same href, so React finds the resource on hydration and
 * does not insert (and wait for) a blocking copy.
 */
export async function inlineCriticalCss(html, assetsDir) {
  const before = (html.match(STYLESHEET_LINK) ?? []).map(hrefOf).filter(Boolean);
  if (!before.length) return html;
  const beasties = new Beasties({
    path: assetsDir, publicPath: "/", preload: "media", inlineThreshold: 8192, pruneSource: false,
    reduceInlineStyles: false, mergeStylesheets: true, inlineFonts: false, preloadFonts: false, logLevel: "warn",
  });
  // Beasties marks the root it worked on; the attribute is not ours and React would see an extra attribute on <html>.
  let out = (await beasties.process(html)).replace(/ data-beasties-container(?:="")?/g, "");
  const head = out.slice(0, out.indexOf("</head>"));
  const asyncLinks = (head.replace(/<noscript>[\s\S]*?<\/noscript>/g, "").match(STYLESHEET_LINK) ?? []);
  const missing = before.filter((href) => !asyncLinks.some((tag) => hrefOf(tag) === href));
  if (missing.length) {
    const tags = missing.map((href) => `<link rel="stylesheet" href="${href}" data-precedence="next" media="print" onload="this.media='all'">`).join("");
    out = out.replace("</head>", `${tags}</head>`);
  }
  const final = out.slice(0, out.indexOf("</head>")).replace(/<noscript>[\s\S]*?<\/noscript>/g, "").match(STYLESHEET_LINK) ?? [];
  assert.ok(final.every((tag) => !isBlocking(tag)), "a stylesheet still blocks the first paint");
  assert.match(out, /<style>[^<]+<\/style>/, "no critical CSS was inlined");
  return out;
}

// Spot detail pages (/spots/<uuid>) render per request on the Worker and are edge-cached for an hour
// (cloudflare/opennext/edge-html-cache.ts), so the build cannot rewrite their HTML. Instead it writes the critical CSS
// for the spot template here; the Worker inlines it into each spot HTML on an edge-cache miss
// (cloudflare/opennext/critical-css.ts). Push AL2: the hero photo loaded in 180 ms, but LCP waited on the same three
// render-blocking sheets as the home page.
export const SPOT_CRITICAL_CSS_ASSET = "_localley/critical-spot.json";
// A live spot page (scripts and preloads removed), the template the rules are matched against. Refresh it after a
// larger spot page redesign: curl a live /spots/<uuid> and strip <script> and preload tags. A missing class only
// paints unstyled until the async full sheet arrives; it never breaks the page.
export const SPOT_TEMPLATE_FIXTURE = "scripts/fixtures/spot-critical.html";

/**
 * Critical CSS for the spot template, one entry per stylesheet of this build. The spot route uses the same sheets as
 * "/" (root layout CSS), so their hrefs come from the home prerender; the order can differ between routes, so each
 * sheet is matched on its own and the Worker emits the entries in the page's own link order (cascade kept).
 * Returns null when "/" has no stylesheet. The Worker applies the CSS only when a spot page links exactly these sheets.
 */
export async function spotCriticalCss(homeHtml, templateHtml, assetsDir) {
  const head = homeHtml.slice(0, homeHtml.indexOf("</head>")).replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
  const sheets = [...new Set((head.match(STYLESHEET_LINK) ?? []).map(hrefOf).filter(Boolean))];
  if (!sheets.length) return null;
  assert.ok((templateHtml.match(STYLESHEET_LINK) ?? []).length, "the spot template has no stylesheet link");
  const styleTags = (html) => html.match(/<style\b[^>]*>[\s\S]*?<\/style>/g) ?? [];
  const css = {};
  for (const href of sheets) {
    let first = true;
    const page = templateHtml.replace(STYLESHEET_LINK, () => (first ? ((first = false), `<link rel="stylesheet" href="${href}" data-precedence="next"/>`) : ""));
    const before = new Set(styleTags(page));
    css[href] = styleTags(await inlineCriticalCss(page, assetsDir)).filter((tag) => !before.has(tag))
      .map((tag) => tag.replace(/^<style\b[^>]*>/, "").replace(/<\/style>$/, "")).join("");
    assert.doesNotMatch(css[href], /<\/style/i, "critical CSS would close its <style> tag");
  }
  assert.ok(Object.values(css).some((rules) => rules.length > 0), "no critical CSS for the spot template");
  return { css };
}

export function assertStaticPrerender(route, manifest, html) {
  const entry = manifest.routes?.[route];
  assert.ok(entry, `${route} is not prerendered`);
  assert.equal(entry.initialRevalidateSeconds, false, `${route} revalidates; it must stay on the Worker`);
  assert.match(html, /^<!DOCTYPE html>/i, `${route} prerender is not an HTML document`);
  assert.match(html, /<\/html>\s*$/, `${route} prerender is incomplete`);
  // A per-request nonce would be frozen into every response.
  assert.doesNotMatch(html, /\bnonce="[^"]+"/, `${route} prerender carries a nonce`);
}

export async function packageStaticPublicHtml(root = process.cwd()) {
  const app = path.join(root, ".next", "server", "app");
  const assets = path.join(root, ".open-next", "assets");
  const manifest = JSON.parse(await readFile(path.join(root, ".next", "prerender-manifest.json"), "utf8"));
  const copied = [];
  for (const [route, file] of Object.entries(STATIC_PUBLIC_PAGES)) {
    const source = path.join(app, file);
    assertStaticPrerender(route, manifest, await readFile(source, "utf8"));
    await mkdir(path.dirname(path.join(assets, file)), { recursive: true });
    if (CRITICAL_CSS_PAGES.has(route)) {
      await writeFile(path.join(assets, file), deferChunkScripts(await inlineCriticalCss(await readFile(source, "utf8"), assets)));
      copied.push(`${route} -> ${file} (critical CSS${route === "/" ? ", JS after hero" : ""})`);
    } else {
      await copyFile(source, path.join(assets, file));
      copied.push(`${route} -> ${file}`);
    }
  }
  const home = await readFile(path.join(app, STATIC_PUBLIC_PAGES["/"]), "utf8");
  const critical = (home.match(STYLESHEET_LINK) ?? []).length
    ? await spotCriticalCss(home, await readFile(path.join(root, SPOT_TEMPLATE_FIXTURE), "utf8"), assets)
    : null;
  if (critical) {
    await mkdir(path.dirname(path.join(assets, SPOT_CRITICAL_CSS_ASSET)), { recursive: true });
    await writeFile(path.join(assets, SPOT_CRITICAL_CSS_ASSET), JSON.stringify(critical));
    copied.push(`spot critical CSS -> ${SPOT_CRITICAL_CSS_ASSET} (${Object.values(critical.css).join("").length} B)`);
  }
  return copied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const line of await packageStaticPublicHtml()) console.log(`static public HTML: ${line}`);
}
