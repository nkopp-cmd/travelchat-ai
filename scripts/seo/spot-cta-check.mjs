#!/usr/bin/env node
// Push DO3: fetch every spot of the spots sitemap (paced, Push DM2) and require a planner link with a city:
// spot + city, or for a day-trip spot (Push CK1) the nearest planner city. Day-trip pages are listed as NEARBY.
// Usage: node scripts/seo/spot-cta-check.mjs [base-url] [--rps 2]   Exit 1 on any page without the link or a failed load.
import { pacer } from "./click-depth-lib.mjs";
import { plannerCtaKind, sitemapLocs, spotIdOf } from "./spot-cta-lib.mjs";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || "https://www.localley.io").replace(/\/$/, "");
const rpsAt = args.indexOf("--rps");
const rps = rpsAt >= 0 ? Number(args[rpsAt + 1]) || 2 : 2;
// Our own check: the funnel and the money probe skip it (lib/check-traffic.ts).
const headers = { "X-Localley-Check": "1", "User-Agent": "LocalleySpotCtaCheck/1.0" };

const sitemap = await fetch(`${base}/sitemaps/spots-1.xml`, { headers });
if (!sitemap.ok) { console.error(`spot-cta-check: sitemap ${sitemap.status}`); process.exit(1); }
const spots = sitemapLocs(await sitemap.text()).map((url) => ({ url, id: spotIdOf(url) })).filter((s) => s.id);
const wait = pacer(rps);
const missing = [];
const nearby = [];
const failed = [];
for (const { url, id } of spots) {
  await wait();
  try {
    const res = await fetch(url.replace(/^https?:\/\/[^/]+/, base), { headers });
    if (!res.ok) { failed.push(`${res.status} ${url}`); continue; }
    const kind = plannerCtaKind(await res.text(), id);
    if (!kind) missing.push(url);
    else if (kind === "city") nearby.push(url);
  } catch (error) {
    failed.push(`${error.message} ${url}`);
  }
}
for (const line of [...nearby.map((u) => `NEARBY ${u}`), ...missing.map((u) => `MISSING ${u}`), ...failed.map((f) => `FAILED ${f}`)]) console.log(line);
console.log(JSON.stringify({ spots: spots.length, ok: spots.length - missing.length - failed.length, nearby: nearby.length, missing: missing.length, failed: failed.length }));
process.exit(missing.length || failed.length || !spots.length ? 1 : 0);
