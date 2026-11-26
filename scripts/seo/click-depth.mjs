#!/usr/bin/env node
// Click depth from / (Push DK3): every indexable city list must be <= 2 clicks from home, every indexable spot <= 3.
// Targets = the URLs in the live sitemap (DK2: only indexable pages are listed).
// Usage: node scripts/seo/click-depth.mjs [--base https://www.localley.io] [--json out.json]
// Fetches pages up to depth 2 (their links give depth 3). Exit 0 when every target is within budget, else 1.
import { writeFileSync } from "node:fs";
import { sitemapLocs } from "./orphan-check-lib.mjs";
import { bfsDepth, depthReport, internalLinks } from "./click-depth-lib.mjs";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const base = (opt("--base") ?? "https://www.localley.io").replace(/\/$/, "");
const UA = "LocalleyClickDepth/1.0";
const MAX_FETCH = 4000;

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const toPath = (loc) => { const u = new URL(loc); return (u.pathname.replace(/\/$/, "") || "/") + u.search; };
const targets = [];
for (const loc of sitemapLocs(await get(`${base}/sitemap.xml`))) {
  if (loc.endsWith(".xml")) targets.push(...sitemapLocs(await get(loc.replace(/^https:\/\/www\.localley\.io/, base))).map(toPath));
  else targets.push(toPath(loc));
}

// Level-by-level fetch so bfsDepth can run on a plain map afterwards.
const graph = new Map();
let frontier = ["/"];
const seen = new Set(frontier);
let fetched = 0, failed = 0;
for (let d = 0; d < 3 && frontier.length; d++) {
  const next = [];
  if (d < 3) {
    await pool(frontier, 6, async (path) => {
      if (fetched >= MAX_FETCH) return;
      fetched++;
      try { graph.set(path, [...internalLinks(await get(base + path))]); } catch { failed++; graph.set(path, []); }
    });
  }
  for (const p of frontier) for (const q of graph.get(p) ?? []) if (!seen.has(q)) { seen.add(q); next.push(q); }
  frontier = d < 2 ? next : [];
}
const depth = bfsDepth("/", (p) => graph.get(p), 3);
const report = depthReport(targets, depth);

console.log(`base=${base} sitemap_urls=${targets.length} fetched=${fetched} failed=${failed}${fetched >= MAX_FETCH ? " (fetch cap hit)" : ""}`);
let ok = true;
for (const [type, r] of Object.entries(report)) {
  const budget = type === "city" ? 2 : 3;
  console.log(`${type}: ${r.within}/${r.total} within ${budget} clicks; over=${r.over.length}${r.over.length ? " e.g. " + r.over.slice(0, 5).join(" ") : ""}`);
  if (r.over.length) ok = false;
}
const hist = {};
for (const t of targets) { const k = depth.get(t) ?? ">3"; hist[k] = (hist[k] ?? 0) + 1; }
console.log("sitemap depth histogram:", JSON.stringify(hist));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ base, at: new Date().toISOString(), report, hist }, null, 2));
process.exit(ok ? 0 : 1);
