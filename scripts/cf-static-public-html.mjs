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
};

/**
 * Pages whose HTML gets inlined critical CSS (Push AL3, home LCP). The 25 KB gzip global sheet blocked the first
 * paint for one extra round trip: Lighthouse mobile LCP 2.1 s with the hero image already at fetchpriority high.
 * Only "/" for now: it is the landing page and the one measured; other pages keep the exact bytes.
 */
export const CRITICAL_CSS_PAGES = new Set(["/"]);

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
      await writeFile(path.join(assets, file), await inlineCriticalCss(await readFile(source, "utf8"), assets));
      copied.push(`${route} -> ${file} (critical CSS)`);
    } else {
      await copyFile(source, path.join(assets, file));
      copied.push(`${route} -> ${file}`);
    }
  }
  return copied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const line of await packageStaticPublicHtml()) console.log(`static public HTML: ${line}`);
}
