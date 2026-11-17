#!/usr/bin/env node
// Localley free new-places source (shared/plans/localley-mobile-map-ux-asia-growth.md item 6; Nils 2026-11-16 "that's
// underperforming"). The paid Apify crawl (discover-new-places.mjs) does one city a day and stops while the SPEND.md
// guard is over, so 8 of the 10 watch cities got no new spot in 14 days. This job costs nothing: one OpenStreetMap
// Overpass query per city for notable places (name + wikidata + wikipedia tags), with an exact street address from the
// OSM addr:* tags or one Nominatim reverse lookup (max 1 request per second). Rows go to apify_spot_candidates with
// source_type 'map_discovery' (the column CHECK allows only map_discovery|social_trend; the "osm:" place_id prefix marks
// OSM rows); promote-candidates.mjs runs the same gate (wikipedia link = signal, hotel filter,
// dedupe, subscription copy, exact address) and its 30-per-city cap.
// Cities: the watch cities with the fewest new visible spots in 14 days, CITIES_PER_RUN per day, each at most once per
// REQUERY_DAYS. Candidates hang on the day's apify_spot_discovery_runs row (UNIQUE discovery_date): the Apify row when it
// ran, else one 'osm-overpass' row. Dry run unless --apply.
//
// Usage: node scripts/discover-osm-places.mjs [--apply] [--city <slug>]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compactName, distanceKm, MAX_CITY_KM, WATCH_CITIES, WATCH_DAYS } from "./promote-candidates.mjs";
import { parseCityList } from "./discover-new-places.mjs";
import { commonsFileUrl, imageNear, p18Files } from "./photos/osm-spot-photo.mjs";

const ACCOUNT = "664f242340bcec2f32daaeee15f58bde";
const APP_DB = "f1cc916b-5606-443f-9c4f-695c4ccc4a63"; // localley-app (production)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_FILE = join(homedir(), ".local/state/localley/osm-discovery.json");
const UA = "localley-new-places/1.0 (+https://localley.io)";

export const SOURCE_TYPE = "map_discovery"; // D1 CHECK (source_type IN ('map_discovery', 'social_trend'))
export const ACTOR_ID = "osm-overpass";
export const RADIUS_M = 15000;
export const CITIES_PER_RUN = 3;
export const REQUERY_DAYS = 7;
export const MAX_CONSIDER = 200; // ranked places looked at per city
export const MAX_PER_CITY = 30; // inserts per city per run (the promoter cap)
export const MAX_WORSHIP_PER_CITY = 6; // temples/shrines dominate OSM; keep variety
export const MAX_REVERSE_PER_CITY = 90;
export const SAME_PLACE_M = 300;

/** OSM key -> values we list. Values outside this map are dropped. */
export const KINDS = {
  tourism: ["attraction", "museum", "gallery", "viewpoint", "zoo", "aquarium", "theme_park"],
  amenity: ["cafe", "restaurant", "bar", "pub", "marketplace", "place_of_worship", "theatre", "arts_centre"],
  leisure: ["park", "garden", "nature_reserve"],
  historic: ["castle", "monument", "memorial", "palace", "fort", "city_gate"],
};

export function overpassQuery(city, radiusM = RADIUS_M) {
  const parts = Object.entries(KINDS).map(([k, vs]) =>
    `nwr(around:${radiusM},${city.lat},${city.lng})["name"]["wikidata"]["${k}"~"^(${vs.join("|")})$"];`);
  return `[out:json][timeout:90];(${parts.join("")});out center tags;`;
}

const str = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** First listed kind of an element, e.g. { key: "tourism", value: "museum" }, or null. */
export function kindOf(tags) {
  for (const [key, values] of Object.entries(KINDS)) if (values.includes(tags[key])) return { key, value: tags[key] };
  return null;
}

/** Local street address from OSM addr:* tags, or "" without house number + street. */
export function osmAddress(tags, city) {
  const hn = str(tags["addr:housenumber"]), street = str(tags["addr:street"]);
  if (!hn || !street) return "";
  const area = str(tags["addr:subdistrict"] || tags["addr:district"] || tags["addr:suburb"]);
  return [`${hn} ${street}`, area, city.name, city.country].filter(Boolean).join(", ");
}

/** One Overpass element -> candidate fields, or null (no name/wikidata/wikipedia, unknown kind, hotel, too far). */
export function normalizeOsm(el, city) {
  const tags = el?.tags ?? {};
  const lat = Number(el.lat ?? el.center?.lat), lng = Number(el.lon ?? el.center?.lon);
  const name = str(tags["name:en"] || tags.name);
  const kind = kindOf(tags);
  const wiki = Object.keys(tags).some((k) => k === "wikipedia" || k.startsWith("wikipedia:"));
  if (!name || !str(tags.wikidata) || !wiki || !kind || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (tags.tourism === "hotel" || tags.building === "hotel" || tags.disused === "yes" || tags["disused:amenity"]) return null;
  if (distanceKm(city, { lat, lng }) > MAX_CITY_KM) return null;
  const osmType = { node: "node", way: "way", relation: "relation" }[el.type];
  if (!osmType || !Number.isInteger(el.id)) return null;
  return {
    placeId: `osm:${osmType}/${el.id}`, citySlug: city.slug, name, localName: str(tags.name),
    address: osmAddress(tags, city), latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)),
    mapsUrl: `https://www.openstreetmap.org/${osmType}/${el.id}`, categoryName: kind.value.replace(/_/g, " "),
    categories: [kind.value, "wikipedia", `wikidata:${str(tags.wikidata)}`], kindKey: kind.key,
  };
}

/** Variety first: every non-worship place, then at most MAX_WORSHIP_PER_CITY places of worship; MAX_CONSIDER total. */
export function rankCandidates(list) {
  const seen = new Set();
  const uniq = list.filter((c) => c && !seen.has(c.placeId) && seen.add(c.placeId));
  const worship = uniq.filter((c) => c.categories[0] === "place_of_worship").slice(0, MAX_WORSHIP_PER_CITY);
  return [...uniq.filter((c) => c.categories[0] !== "place_of_worship"), ...worship].slice(0, MAX_CONSIDER);
}

/** Watch cities sorted by fewest new spots in WATCH_DAYS, skipping cities queried in the last REQUERY_DAYS. */
export function pickCities(cities, newByCity, lastQueried, now = new Date(), n = CITIES_PER_RUN) {
  const cutoff = new Date(now.getTime() - REQUERY_DAYS * 86400000).toISOString().slice(0, 10);
  return WATCH_CITIES.map((name) => Object.values(cities).find((c) => c.name === name)).filter(Boolean)
    .filter((c) => !(lastQueried[c.slug] > cutoff))
    .map((c, i) => ({ c, i, n: newByCity[c.name] ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i).slice(0, n).map((x) => x.c);
}

/** True when an existing spot has the same compact name (either contains the other) within SAME_PLACE_M. */
export function isListed(c, spots) {
  const want = compactName(c.name), local = compactName(c.localName);
  return spots.some((s) => {
    const have = compactName(s.name);
    if (!have || distanceKm(c, s) * 1000 > SAME_PLACE_M) return false;
    return [want, local].some((w) => w && (have.includes(w) || w.includes(have)));
  });
}

/** Nominatim reverse result -> local street address, or "" without house number + road. */
export function reverseAddress(data, city) {
  const a = data?.address ?? {};
  const hn = str(a.house_number), road = str(a.road || a.pedestrian || a.footway);
  if (!hn || !road) return "";
  const area = str(a.suburb || a.city_district || a.quarter || a.neighbourhood);
  return [`${hn} ${road}`, area, city.name, city.country].filter(Boolean).join(", ");
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

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Public Overpass servers answer 502/504 when busy: try the main server, then a mirror, then the main server once more.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"];
async function overpass(city) {
  let last = "";
  for (const [i, url] of OVERPASS.entries()) {
    if (i) await pause(15000);
    const response = await fetch(url, {
      method: "POST", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: overpassQuery(city) }), signal: AbortSignal.timeout(120000),
    }).catch((e) => ({ ok: false, status: e.name }));
    if (response.ok) return (await response.json()).elements ?? [];
    await response.body?.cancel();
    last = `overpass ${response.status}`;
  }
  throw new Error(last);
}

async function reverse(c, city) {
  await pause(1100); // Nominatim usage policy: max 1 request per second
  const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=en&lat=${c.latitude}&lon=${c.longitude}`;
  const response = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  return response.ok ? reverseAddress(await response.json(), city) : "";
}

/** Wikidata id of a normalized place ("wikidata:Q1" category), or null. */
export function wikidataId(c) {
  const tag = (c?.categories ?? []).find((x) => /^wikidata:Q\d+$/.test(x));
  return tag ? tag.slice("wikidata:".length) : null;
}

async function knownIds(ids) {
  const known = new Set();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await d1(`SELECT place_id id FROM apify_spot_candidates WHERE place_id IN (${chunk.map(() => "?").join(", ")})`, chunk);
    rows.forEach((r) => known.add(r.id));
  }
  return known;
}

export const INSERT_CANDIDATE_SQL = `INSERT INTO apify_spot_candidates (run_id, city_slug, place_id, name, address, latitude, longitude, maps_url,
  category_name, categories, total_score, reviews_count, price, primary_image_url, discovery_query, recommended_localley_score, source_type)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 'osm notable places', 3, ?)
  ON CONFLICT (place_id) DO NOTHING RETURNING id`;

export function candidateParams(runId, c, image) {
  return [runId, c.citySlug, c.placeId, c.name, c.address, c.latitude, c.longitude, c.mapsUrl, c.categoryName, JSON.stringify(c.categories), image, SOURCE_TYPE];
}

async function dayRunId(date) {
  const row = (await d1("SELECT id FROM apify_spot_discovery_runs WHERE discovery_date = ?", [date]))[0];
  if (row) return row.id;
  const id = randomUUID(), now = new Date().toISOString();
  await d1(`INSERT INTO apify_spot_discovery_runs (id, discovery_date, city_slug, actor_id, actor_run_id, state, max_places, completed_at)
    VALUES (?, ?, 'osm-multi', ?, ?, 'succeeded', 100, ?)`, [id, date, ACTOR_ID, `osm:${date}:${id}`, now]);
  return id;
}

function readState() { try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return {}; } }

export async function run({ apply = false, city: onlyCity = null, now = new Date(), log = console.log } = {}) {
  const date = now.toISOString().slice(0, 10);
  const cities = parseCityList(readFileSync(join(ROOT, "lib/cities.ts"), "utf8"));
  const since = new Date(now.getTime() - WATCH_DAYS * 86400000).toISOString();
  const newByCity = Object.fromEntries((await d1(`SELECT city, count(*) n FROM spots WHERE visible = 1 AND created_at >= ?
    AND city IN (${WATCH_CITIES.map(() => "?").join(", ")}) GROUP BY city`, [since, ...WATCH_CITIES])).map((r) => [r.city, r.n]));
  const state = readState();
  const picked = onlyCity ? [cities[onlyCity]].filter(Boolean) : pickCities(cities, newByCity, state);
  const out = { date, cities: {}, inserted: 0 };
  let runId = null;
  for (const city of picked) {
    const stat = { found: 0, fresh: 0, exact: 0, inserted: 0 };
    out.cities[city.slug] = stat;
    let list;
    try { list = rankCandidates((await overpass(city)).map((el) => normalizeOsm(el, city))); } catch (e) { stat.error = e.message; continue; }
    stat.found = list.length;
    const known = await knownIds(list.map((c) => c.placeId));
    const spots = (await d1("SELECT name, latitude lat, longitude lng FROM spots WHERE city = ?", [city.name])).map((r) => {
      let n = r.name; try { n = JSON.parse(r.name)?.en ?? r.name; } catch { /* plain text name */ }
      return { name: n, lat: Number(r.lat), lng: Number(r.lng) };
    });
    const fresh = list.filter((c) => !known.has(c.placeId) && !isListed({ ...c, lat: c.latitude, lng: c.longitude }, spots));
    stat.fresh = fresh.length;
    // A public spot needs a real photo: keep only places whose Wikidata item has an image (P18) and sits within 1 km. The promoter stores it in R2.
    const images = await p18Files(fresh.map(wikidataId).filter(Boolean)).catch((e) => { stat.error = `wikidata: ${e.message}`; return {}; });
    const imageOf = (c) => imageNear(images[wikidataId(c)], { lat: c.latitude, lng: c.longitude });
    const withPhoto = fresh.filter(imageOf);
    stat.withPhoto = withPhoto.length;
    let lookups = 0;
    for (const c of withPhoto) {
      if (stat.exact >= MAX_PER_CITY) break;
      if (!c.address && lookups < MAX_REVERSE_PER_CITY) { lookups++; c.address = await reverse(c, city).catch(() => ""); }
      if (!c.address) continue;
      stat.exact++;
      const image = commonsFileUrl(imageOf(c));
      if (!apply) { log(`would insert: ${city.name} | ${c.name} | ${c.categoryName} | ${c.address} | ${image}`); continue; }
      runId ??= await dayRunId(date);
      // No OR IGNORE: it also swallowed CHECK failures (2026-11-17: 45 rows "inserted", 0 stored). Only a known place_id is skipped.
      const added = await d1(INSERT_CANDIDATE_SQL, candidateParams(runId, c, image)).catch((e) => { stat.error = `insert: ${e.message}`; return null; });
      if (!added) break;
      if (added.length) { stat.inserted++; out.inserted++; }
    }
    if (apply) state[city.slug] = date;
  }
  if (apply) { mkdirSync(dirname(STATE_FILE), { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(state)); }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const out = await run({ apply: args.includes("--apply"), city: opt("--city") });
  console.log(`${new Date().toISOString()} osm discovery${args.includes("--apply") ? "" : " (dry run)"}: ${JSON.stringify(out)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((e) => { console.error(`osm discovery failed: ${e.message}`); process.exitCode = 1; });
