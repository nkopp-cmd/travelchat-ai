#!/usr/bin/env node
// Trip-story plan T1: export posted TikTok carousel trips for blog posts.
//   node scripts/trip-story/export.mjs --list               posted trips that can become a post
//   node scripts/trip-story/export.mjs --out DIR [--limit N] write DIR/<itineraryId>.json
//   ... --derive                                              also put 4:5 AVIF/WebP derivatives in R2 (trip-story/<sha>-<w>.<ext>)
// Reads: carousel ledger (agent host), production D1 (SELECT only). Writes: local JSON, R2 objects (content-addressed).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DERIVATIVE_FORMATS, DERIVATIVE_WIDTHS, buildTrip, derivativeKey, postedTrips, tripImages } from "./export-lib.mjs";

const ACCOUNT = "664f242340bcec2f32daaeee15f58bde";
const APP_DB = "f1cc916b-5606-443f-9c4f-695c4ccc4a63"; // localley-app (production)
const BUCKET = "localley-legacy-media"; // STORY_MEDIA_R2, EU jurisdiction (wrangler.jsonc)
const r2Headers = (auth, extra = {}) => ({ authorization: `Bearer ${auth}`, "cf-r2-jurisdiction": "eu", ...extra });
const LEDGER = join(homedir(), ".local/state/localley/tiktok-carousel-ledger.json");
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const line = readFileSync(join(homedir(), "secrets/keys.env"), "utf8").split("\n").find((l) => l.startsWith("CLOUDFLARE_API_TOKEN="));
  if (!line) throw new Error("CLOUDFLARE_API_TOKEN missing");
  return line.slice("CLOUDFLARE_API_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
}

async function select(auth, sql, params = []) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("SELECT only");
  const res = await fetch(`${API}/d1/database/${APP_DB}/query`, {
    method: "POST", headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ sql, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(`D1 HTTP ${res.status}`);
  return body.result?.[0]?.results ?? [];
}

const r2Url = (key) => `${API}/r2/buckets/${BUCKET}/objects/${key}`;

async function r2Exists(auth, key) {
  const res = await fetch(r2Url(key), { method: "GET", headers: r2Headers(auth, { range: "bytes=0-0" }) });
  await res.arrayBuffer().catch(() => undefined);
  return res.ok;
}

async function derive(auth, sha, workDir) {
  const missing = DERIVATIVE_WIDTHS.flatMap((w) => DERIVATIVE_FORMATS.map((f) => [w, f]));
  const todo = [];
  for (const [w, f] of missing) if (!(await r2Exists(auth, derivativeKey(sha, w, f)))) todo.push([w, f]);
  if (!todo.length) return 0;
  const res = await fetch(r2Url(`legacy/${sha}.jpg`), { headers: r2Headers(auth) });
  if (!res.ok) throw new Error(`R2 read legacy/${sha}.jpg: ${res.status}`);
  const src = join(workDir, `${sha}.jpg`);
  writeFileSync(src, new Uint8Array(await res.arrayBuffer()));
  for (const [w, f] of todo) {
    const out = join(workDir, `${sha}-${w}.${f}`);
    // 1080x1920 portrait -> centred 4:5 crop, then resize. Metadata stripped.
    execFileSync("magick", [src, "-gravity", "center", "-crop", "1080x1350+0+0", "+repage", "-resize", `${w}x${Math.round(w * 1.25)}`,
      "-strip", "-quality", f === "avif" ? "55" : "78", out]);
    const put = await fetch(r2Url(derivativeKey(sha, w, f)), {
      method: "PUT", headers: r2Headers(auth, { "content-type": f === "avif" ? "image/avif" : "image/webp" }), body: readFileSync(out),
    });
    if (!put.ok) throw new Error(`R2 upload ${derivativeKey(sha, w, f)}: ${put.status}`);
  }
  return todo.length;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const auth = token();
  const ledger = JSON.parse(readFileSync(LEDGER, "utf8"));
  const posted = postedTrips(ledger).slice(0, Number(value("--limit")) || Infinity);
  const outDir = value("--out");
  if (outDir) mkdirSync(outDir, { recursive: true });
  const workDir = join(homedir(), ".cache/localley-trip-story");
  const results = [];
  for (const entry of posted) {
    const [itinerary] = await select(auth, `SELECT id, title, city, days, activities, ai_backgrounds FROM itineraries WHERE id = ?`, [entry.itineraryId]);
    const ids = [...String(itinerary?.activities ?? "").matchAll(/"spotId"\s*:\s*"([0-9a-f-]{36})"/g)].map((m) => m[1]);
    const spots = ids.length ? await select(auth, `SELECT id, name, description, category, localley_score, visible, address, address_json, tips, best_times
      FROM spots WHERE id IN (${ids.map(() => "?").join(",")})`, [...new Set(ids)]) : [];
    const { trip, skip } = buildTrip({ itinerary, spots, postedAt: entry.postedAt });
    if (!trip) { results.push({ itineraryId: entry.itineraryId, city: entry.city, skip }); continue; }
    let derived = 0;
    if (flag("--derive")) {
      mkdirSync(workDir, { recursive: true });
      for (const sha of tripImages(trip)) derived += await derive(auth, sha, workDir);
    }
    if (outDir) writeFileSync(join(outDir, `${trip.itineraryId}.json`), `${JSON.stringify(trip, null, 2)}\n`);
    results.push({ itineraryId: trip.itineraryId, city: trip.city, days: trip.days.length, stops: trip.days.reduce((n, d) => n + d.stops.length, 0), derived });
  }
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({ trips: results.filter((r) => !r.skip).length, skipped: results.filter((r) => r.skip).length, results })}\n`);
}

main().catch((error) => { process.stderr.write(`trip-story export: ${error.message}\n`); process.exit(1); });
