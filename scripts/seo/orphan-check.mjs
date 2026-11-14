#!/usr/bin/env node
// Orphan check (L3, weekend-sprint-20261114): every spot URL in the live sitemap must be linked from a crawlable page.
// Usage: node scripts/seo/orphan-check.mjs [--base https://www.localley.io] [--deep]
//   default: crawl /, /spots and every /spots?city=<slug> hub found on those pages or in the sitemap.
//   --deep:  also crawl the spot pages themselves (nearby links) for ids the hubs miss.
// Exit 0 with "orphans=0", else exit 1 and print the orphan ids.
import { findOrphans, linkedSpotIds, sitemapLocs, spotIdsFromUrls } from "./orphan-check-lib.mjs";

const args = process.argv.slice(2);
const base = (args.includes("--base") ? args[args.indexOf("--base") + 1] : "https://www.localley.io").replace(/\/$/, "");
const deep = args.includes("--deep");
const UA = "LocalleyOrphanCheck/1.0";

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const index = sitemapLocs(await get(`${base}/sitemap.xml`));
const allLocs = [];
for (const loc of index) allLocs.push(...(loc.endsWith(".xml") ? sitemapLocs(await get(loc.replace(/^https:\/\/www\.localley\.io/, base))) : [loc]));
const sitemapIds = spotIdsFromUrls(allLocs);

const hubPaths = new Set(["/", "/spots"]);
for (const loc of allLocs) { const u = new URL(loc); if (u.pathname === "/spots" && u.searchParams.get("city")) hubPaths.add(`/spots?city=${u.searchParams.get("city")}`); }
const seed = await get(`${base}/`);
for (const m of seed.matchAll(/href="\/spots\?city=([a-z-]+)"/g)) hubPaths.add(`/spots?city=${m[1]}`);

const linked = new Set();
let pages = 0;
await pool([...hubPaths], 4, async (path) => { for (const id of linkedSpotIds(await get(base + path))) linked.add(id); pages++; });
let orphans = findOrphans(sitemapIds, linked);
console.log(`sitemap_spots=${sitemapIds.size} hubs=${pages} linked_from_hubs=${linked.size} orphans_after_hubs=${orphans.length}`);

if (deep && orphans.length) {
  const spotPages = [...sitemapIds];
  await pool(spotPages, 8, async (id) => { try { for (const l of linkedSpotIds(await get(`${base}/spots/${id}`))) if (l !== id) linked.add(l); } catch (e) { console.error(String(e)); } });
  orphans = findOrphans(sitemapIds, linked);
  console.log(`deep_pages=${spotPages.length} orphans_after_deep=${orphans.length}`);
}

console.log(`orphans=${orphans.length}`);
if (orphans.length) { console.log(orphans.slice(0, 50).join("\n")); process.exit(1); }
