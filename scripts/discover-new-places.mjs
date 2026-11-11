#!/usr/bin/env node
// Localley new-place discovery (shared/plans/localley-mobile-map-ux-asia-growth.md item 6). Runs on our own server
// (HYBRID RULE), not as a Cloudflare cron: one top-10 city per day, the city whose last discovery run is the oldest.
// One Apify Google Maps crawl (hard charge cap per run, only when spend-guard + apify-guard pass) -> the same filters as
// lib/apify-spot-discovery.ts -> new rows in D1 apify_spot_candidates (status pending). The candidate promoter
// (scripts/promote-candidates.mjs) then runs the spot gate and creates visible spots. No photo is stored here: the
// candidate row keeps the Google image URL only as the D1 column requires it; the promoter never copies it.
//
// One run row per date (UNIQUE discovery_date): the job skips a date that already has a run (e.g. the monthly
// Cloudflare cron on day 1). The true Apify charge is appended to shared/plans/SPEND.md after every paid run.
//
// Usage: node scripts/discover-new-places.mjs [--apply] [--city <slug>]   (dry run = no paid call, no writes)

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { distanceKm, WATCH_CITIES } from "./promote-candidates.mjs";

const ACCOUNT = "664f242340bcec2f32daaeee15f58bde";
const APP_DB = "f1cc916b-5606-443f-9c4f-695c4ccc4a63"; // localley-app (production)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = "/home/dev/projects/CyberLink/shared";
const SPEND = join(SHARED, "plans/SPEND.md");
const GUARDS = ["spend-guard.sh", "apify-guard.sh"].map((f) => join(SHARED, "scripts", f));

export const ACTOR = "compass~crawler-google-places";
export const MAX_CHARGE_USD = 0.5;
export const MAX_PLACES = 100;
export const QUERIES = ["hidden gem restaurant", "local cafe", "local market", "independent shop", "scenic viewpoint",
  "cocktail bar", "museum", "street food"];
const POLLS = 12; // x 60 s server-side wait each -> at most ~13 min, then the run is aborted
const MAX_KM = 120;

const TRAVELER_CATEGORIES = new Set([
  "amusement park", "antique store", "aquarium", "art center", "art gallery", "bakery",
  "bazaar", "beach", "beer hall", "bistro", "book store", "bookshop", "botanical garden",
  "castle", "cathedral", "church", "cinema", "coffee shop", "cultural center", "day spa",
  "dessert shop", "farmers' market", "farmers market", "flea market", "food court", "food market",
  "gift shop", "hiking area", "hiking trail", "historic site", "historical landmark", "library",
  "market", "monument", "mosque", "mountain peak", "movie theater", "nature preserve",
  "night club", "nightclub", "observation deck", "park", "performing arts theater", "public garden",
  "record store", "sauna", "scenic spot", "shopping mall", "shrine", "spa", "stadium", "tea house",
  "temple", "thrift store", "tourist attraction", "viewpoint", "vintage clothing store", "zoo",
]);
const FAMILY = /^(?:.+ )?(?:bar|cafe|museum|pub|restaurant)$/;
const OPERATIONAL = /(?:^medical spa$|\b(?:equipment supplier|manufacturer|repair shop|service center|supplier|supply store|warehouse|wholesaler)$)/;

/** slug -> { slug, name, country, countryCode, lat, lng } for every city in lib/cities.ts. */
export function parseCityList(source) {
  const out = {};
  const re = /slug:\s*"([a-z0-9-]+)",\s*name:\s*"([^"]+)",\s*country:\s*"([^"]+)",\s*countryCode:\s*"([A-Z]{2})"[\s\S]*?center:\s*\{\s*lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)\s*\}/g;
  for (const m of source.matchAll(re)) out[m[1]] = { slug: m[1], name: m[2], country: m[3], countryCode: m[4], lat: Number(m[5]), lng: Number(m[6]) };
  return out;
}

/** The watch city (top 10, in order) whose latest run is the oldest; a city without any run comes first. */
export function pickCity(cities, lastRunBySlug) {
  const watch = WATCH_CITIES.map((name) => Object.values(cities).find((c) => c.name === name)).filter(Boolean);
  let best = null;
  for (const city of watch) {
    const last = lastRunBySlug[city.slug] ?? "";
    if (!best || last < best.last) best = { city, last };
  }
  return best?.city ?? null;
}

const text = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => { const n = typeof v === "number" ? v : Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
function httpsUrl(v, hostOk, pathOk = () => true) {
  try { const u = new URL(text(v)); const h = u.hostname.toLowerCase(); return u.protocol === "https:" && hostOk(h) && pathOk(u.pathname) ? u.toString() : null; } catch { return null; }
}
const isHost = (h, d) => h === d || h.endsWith(`.${d}`);

export function scoreFor(total, reviews) {
  if (total !== null && total >= 4.6 && reviews !== null && reviews >= 10 && reviews <= 600) return 5;
  if (total !== null && total >= 4.3 && (reviews === null || reviews <= 2000)) return 4;
  return 3;
}

/** Same filters as normalizeApifySpotCandidate in lib/apify-spot-discovery.ts (parity test in __tests__). */
export function normalizePlace(item, city, runId) {
  if (!item || item.permanentlyClosed === true || item.temporarilyClosed === true || item.isAdvertisement === true) return null;
  const loc = item.location && typeof item.location === "object" ? item.location : {};
  const latitude = num(loc.lat ?? loc.latitude ?? item.latitude);
  const longitude = num(loc.lng ?? loc.longitude ?? item.longitude);
  const placeId = text(item.placeId ?? item.place_id);
  const name = text(item.title ?? item.name);
  const address = text(item.address ?? item.fullAddress ?? item.full_address);
  const mapsUrl = httpsUrl(item.url ?? item.mapsUrl ?? item.googleMapsUrl, (h) => isHost(h, "google.com"), (p) => p.startsWith("/maps"));
  const image = httpsUrl(item.imageUrl ?? item.image_url, (h) => isHost(h, "googleusercontent.com") || isHost(h, "ggpht.com"));
  if (!placeId || !name || !address || latitude === null || longitude === null || !mapsUrl || !image) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const cc = text(item.countryCode ?? item.country_code).toUpperCase();
  if (cc && cc !== city.countryCode) return null;
  if (distanceKm(city, { lat: latitude, lng: longitude }) > MAX_KM) return null;
  const totalScore = num(item.totalScore ?? item.rating ?? item.avg_rating);
  const rv = num(item.reviewsCount ?? item.reviewCount ?? item.total_reviews);
  const reviewsCount = rv === null ? null : Math.max(0, Math.floor(rv));
  if (totalScore !== null && totalScore < 4) return null;
  if (reviewsCount !== null && reviewsCount < 5) return null;
  const categories = [...new Set([text(item.categoryName), ...(Array.isArray(item.categories) ? item.categories.map(text) : [])].filter(Boolean))].slice(0, 12);
  const categoryName = text(item.categoryName) || categories[0] || null;
  const traveler = [categoryName || "", ...categories].filter(Boolean)
    .map((c) => c.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim())
    .some((c) => !OPERATIONAL.test(c) && (TRAVELER_CATEGORIES.has(c) || FAMILY.test(c)));
  if (!traveler) return null;
  return {
    runId, citySlug: city.slug, placeId, name, address, latitude, longitude, mapsUrl, categoryName, categories,
    totalScore, reviewsCount, price: text(item.price ?? item.priceLevel) || null, primaryImageUrl: image,
    discoveryQuery: text(item.searchString ?? item.searchQuery) || null, recommendedLocalleyScore: scoreFor(totalScore, reviewsCount),
  };
}

/** Unique by place ID, without place IDs already known (candidates or spots). */
export function freshPlaces(places, known) {
  const seen = new Set(known);
  return places.filter((p) => p && !seen.has(p.placeId) && seen.add(p.placeId));
}

export function actorInput(city) {
  return {
    searchStringsArray: QUERIES, locationQuery: `${city.name}, ${city.country}`,
    maxCrawledPlacesPerSearch: Math.floor(MAX_PLACES / QUERIES.length), language: "en", skipClosedPlaces: true,
    scrapePlaceDetailPage: false, maxImages: 0, scrapeContacts: false, scrapeReviewsPersonalData: false,
  };
}

export function spendLine(date, city, inserted, runId, usd) {
  return `${date} | Apify (Localley) | new-places discovery ${city.name}: ${inserted} new candidates, run ${runId} (true charge $${usd.toFixed(4)}) | $${(Math.ceil(usd * 100) / 100).toFixed(2)}`;
}

// ---------- I/O ----------

async function d1(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${APP_DB}/query`, {
    method: "POST", headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(`D1 query failed (${response.status})`);
  return data.result[0].results;
}

async function apify(path, init = {}) {
  const sep = path.includes("?") ? "&" : "?";
  const response = await fetch(`https://api.apify.com/v2${path}${sep}token=${encodeURIComponent(process.env.APIFY_API_TOKEN)}`, {
    ...init, headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`apify ${path.split("?")[0]} ${response.status}`);
  return response.json();
}

function guardsPass() {
  try { for (const g of GUARDS) execFileSync(g, [], { stdio: "ignore", timeout: 60000 }); return true; } catch { return false; }
}

async function knownPlaceIds(ids) {
  const known = [];
  for (let i = 0; i < ids.length; i += 45) {
    const chunk = ids.slice(i, i + 45);
    const marks = chunk.map(() => "?").join(", ");
    const rows = await d1(`SELECT place_id id FROM apify_spot_candidates WHERE place_id IN (${marks})
      UNION SELECT google_place_id id FROM spots WHERE google_place_id IN (${marks})`, [...chunk, ...chunk]);
    known.push(...rows.map((r) => r.id));
  }
  return known;
}

async function insertCandidate(p) {
  await d1(`INSERT OR IGNORE INTO apify_spot_candidates (run_id, city_slug, place_id, name, address, latitude, longitude, maps_url,
    category_name, categories, total_score, reviews_count, price, primary_image_url, discovery_query, recommended_localley_score, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'map_discovery')`,
  [p.runId, p.citySlug, p.placeId, p.name, p.address, p.latitude, p.longitude, p.mapsUrl, p.categoryName, JSON.stringify(p.categories),
    p.totalScore, p.reviewsCount, p.price, p.primaryImageUrl, p.discoveryQuery, p.recommendedLocalleyScore]);
}

export async function run({ apply = false, city: onlyCity = null, now = new Date(), log = console.log } = {}) {
  const date = now.toISOString().slice(0, 10);
  if ((await d1("SELECT id FROM apify_spot_discovery_runs WHERE discovery_date = ?", [date])).length) return { date, state: "already_ran" };
  const cities = parseCityList(readFileSync(join(ROOT, "lib/cities.ts"), "utf8"));
  const last = Object.fromEntries((await d1("SELECT city_slug, max(discovery_date) d FROM apify_spot_discovery_runs GROUP BY city_slug")).map((r) => [r.city_slug, r.d]));
  const city = onlyCity ? cities[onlyCity] : pickCity(cities, last);
  if (!city) return { date, state: "no_city" };
  if (!apply) return { date, state: "dry_run", city: city.slug, lastRun: last[city.slug] ?? null, input: actorInput(city) };
  if (!process.env.APIFY_API_TOKEN) return { date, city: city.slug, state: "no_token" };
  if (!guardsPass()) return { date, city: city.slug, state: "budget_stop" };

  const runId = randomUUID();
  await d1(`INSERT INTO apify_spot_discovery_runs (id, discovery_date, city_slug, actor_id, actor_run_id, state, max_places)
    VALUES (?, ?, ?, ?, ?, 'starting', ?)`, [runId, date, city.slug, ACTOR, `starting:${runId}`, MAX_PLACES]);
  const finish = (state, error = null) => d1(`UPDATE apify_spot_discovery_runs SET state = ?, error_message = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    [state, error, new Date().toISOString(), new Date().toISOString(), runId]);
  let actorRun;
  try {
    actorRun = (await apify(`/acts/${ACTOR}/runs?waitForFinish=60&maxTotalChargeUsd=${MAX_CHARGE_USD}`, { method: "POST", body: JSON.stringify(actorInput(city)) })).data;
    await d1("UPDATE apify_spot_discovery_runs SET actor_run_id = ?, dataset_id = ?, state = 'running', updated_at = ? WHERE id = ?",
      [actorRun.id, actorRun.defaultDatasetId ?? null, new Date().toISOString(), runId]);
    for (let i = 0; i < POLLS && ["READY", "RUNNING"].includes(actorRun.status); i++) actorRun = (await apify(`/actor-runs/${actorRun.id}?waitForFinish=60`)).data;
    if (["READY", "RUNNING"].includes(actorRun.status)) actorRun = (await apify(`/actor-runs/${actorRun.id}/abort`, { method: "POST" })).data;
  } catch (error) {
    await finish("failed", error.message.slice(0, 500));
    if (actorRun?.id) await recordSpend(date, city, 0, actorRun.id, log);
    return { date, city: city.slug, state: "failed", error: error.message };
  }
  let inserted = 0, normalized = 0, items = 0;
  try {
    // A run stopped by the charge cap ends ABORTED/TIMED-OUT with a partial dataset; its places are still usable.
    const data = await apify(`/datasets/${actorRun.defaultDatasetId}/items?clean=true&limit=${MAX_PLACES}`);
    items = data.length;
    const places = data.map((item) => normalizePlace(item, city, runId)).filter(Boolean);
    normalized = places.length;
    const fresh = freshPlaces(places, await knownPlaceIds([...new Set(places.map((p) => p.placeId))]));
    for (const p of fresh) { await insertCandidate(p); inserted++; }
    await finish(actorRun.status === "SUCCEEDED" || items > 0 ? "succeeded" : "failed", actorRun.status === "SUCCEEDED" ? null : `actor ${actorRun.status}`);
  } catch (error) {
    await finish("failed", error.message.slice(0, 500));
    await recordSpend(date, city, inserted, actorRun.id, log);
    return { date, city: city.slug, state: "failed", error: error.message, inserted };
  }
  const usd = await recordSpend(date, city, inserted, actorRun.id, log);
  return { date, city: city.slug, state: "succeeded", actorStatus: actorRun.status, items, normalized, inserted, usd };
}

async function recordSpend(date, city, inserted, actorRunId, log) {
  let usd = MAX_CHARGE_USD;
  try { usd = Number((await apify(`/actor-runs/${actorRunId}`)).data?.usageTotalUsd) || MAX_CHARGE_USD; } catch (error) { log(`cost read failed: ${error.message} (cap logged)`); }
  appendFileSync(SPEND, `${spendLine(date, city, inserted, actorRunId, usd)}\n`);
  return usd;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  if (!process.env.CLOUDFLARE_API_TOKEN) { console.error("CLOUDFLARE_API_TOKEN missing"); process.exitCode = 1; return; }
  const out = await run({ apply: args.includes("--apply"), city: opt("--city") });
  console.log(`${new Date().toISOString()} new-places discovery: ${JSON.stringify(out)}`);
  if (out.state === "failed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((e) => { console.error(`discovery failed: ${e.message}`); process.exitCode = 1; });
