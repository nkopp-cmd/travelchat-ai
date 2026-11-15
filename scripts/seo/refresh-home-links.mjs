#!/usr/bin/env node
// Refreshes lib/seo/home-links.snapshot.json: the guide-spot rows the static home page links to (indexing F5).
// Why a snapshot: "/" ships as a static asset (scripts/cf-static-public-html.mjs, ~30 ms TTFB in every
// Cloudflare location); the D1 store is not reachable at build time. Source: the live public sitemap + hub pages,
// so the snapshot only holds what Google already sees. Keeps the newest 12 rows per hub (enough for the
// round-robin in lib/seo/home-links.ts and for hubIndexable's 5-spot rule). Run, then commit the JSON.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = process.env.SITE || "https://www.localley.io";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PER_HUB = 12;
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.text(); };
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function cityNames(citiesTs) {
  return new Map([...citiesTs.matchAll(/slug:\s*"([a-z-]+)",\s*name:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

export function hubRows(html, hub, lastmods) {
  const rows = new Map();
  for (const m of html.matchAll(/href="\/spots\/([0-9a-f-]{36})"[^>]*>([^<]+)<\/a>/g)) {
    if (lastmods.has(m[1]) && !rows.has(m[1])) rows.set(m[1], { id: m[1], name: decode(m[2]).trim(), hub, lastmod: lastmods.get(m[1]) });
  }
  return [...rows.values()].filter((r) => r.name)
    .sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? "") || a.id.localeCompare(b.id)).slice(0, PER_HUB);
}

async function main() {
  const names = cityNames(readFileSync(path.join(ROOT, "lib/cities.ts"), "utf8"));
  const index = await get(`${SITE}/sitemap.xml`);
  const lastmods = new Map();
  for (const [, loc] of index.matchAll(/<loc>([^<]*\/sitemaps\/spots-\d+\.xml)<\/loc>/g)) {
    for (const m of (await get(loc)).matchAll(/<loc>[^<]*\/spots\/([0-9a-f-]{36})<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)) lastmods.set(m[1], m[2] ?? null);
  }
  const pages = await get(`${SITE}/sitemaps/pages.xml`);
  const slugs = [...new Set([...pages.matchAll(/\/spots\?city=([a-z-]+)/g)].map((m) => m[1]))];
  const rows = [];
  for (const slug of slugs) {
    const hub = names.get(slug);
    if (!hub) throw new Error(`hub ${slug} is not in lib/cities.ts`);
    rows.push(...hubRows(await get(`${SITE}/spots?city=${slug}`), hub, lastmods));
  }
  if (rows.length < 12) throw new Error(`only ${rows.length} rows; refusing to write a thin snapshot`);
  const out = path.join(ROOT, "lib/seo/home-links.snapshot.json");
  writeFileSync(out, `${JSON.stringify({ source: SITE, rows }, null, 1)}\n`);
  console.log(`home-links snapshot: ${rows.length} rows over ${slugs.length} hubs (${lastmods.size} sitemap spots)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
