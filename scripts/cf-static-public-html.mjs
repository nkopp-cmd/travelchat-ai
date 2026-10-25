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
// The bytes are copied unchanged, scripts included; never transform them.
import assert from "node:assert/strict";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
};

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
    await copyFile(source, path.join(assets, file));
    copied.push(`${route} -> ${file}`);
  }
  return copied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const line of await packageStaticPublicHtml()) console.log(`static public HTML: ${line}`);
}
