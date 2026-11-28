#!/usr/bin/env node
// Localley free new-places source for Korea (shared/plans/localley-mobile-map-ux-asia-growth.md item 6). OSM + Wikidata
// ran dry for Busan (0 new spots a week); the Korea Tourism Organization's KorService2 (Korean TourAPI, free,
// DATA_GO_KR_PROJECT_KEY, 1,000 calls/day) lists ~1,000 Busan places with a KTO photo. This job reads areaBasedList2 per
// content type (attractions, culture venues, restaurants) for the Korean watch cities, keeps places with a free KOGL
// photo on KTO's own host and an exact road address ("... 로/길 <number>"), drops places already listed (same name within
// SAME_PLACE_M, or any spot within NEAR_ANY_M: a KTO title is Korean and many spots only have an English name) and
// inserts at most MAX_PER_CITY rows per city per run into apify_spot_candidates (source_type 'map_discovery',
// place_id "kto:<contentid>"). promote-candidates.mjs then runs its gate (KTO listing = signal), writes the copy on the
// subscription and stores the KTO photo in R2 with its credit. A city with >= ENOUGH_NEW new visible spots in WATCH_DAYS is
// skipped. ~12 calls per city. Dry run unless --apply.
// Usage: node scripts/discover-kto-places.mjs [--apply] [--city busan]

import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { distanceKm, WATCH_CITIES, WATCH_DAYS } from "./promote-candidates.mjs";
import { parseCityList } from "./discover-new-places.mjs";
import { d1, dayRunId, INSERT_CANDIDATE_SQL, isListed, knownIds, SOURCE_TYPE } from "./discover-osm-places.mjs";
import { KTO_IMAGE_HOST } from "./photos/osm-spot-photo.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KOR = "https://apis.data.go.kr/B551011/KorService2/areaBasedList2";

/** Legal-dong region code (lDongRegnCd) per Korean watch city; areaCode 6 returns only a stale subset. */
export const REGION = { Seoul: "11", Busan: "26" };
/** KorService2 content types we list, in pick order; `max` keeps variety (restaurants are half of the list). */
/** `keep` = KorService2 lclsSystm2 prefixes we list. 12: nature (NA), history (HS), sightseeing venues (VE); not the
 * EX experience class (yoga studios, workshops, small firms). 14: museums/galleries/performance (VE01-06), not
 * libraries (VE09), paid experience halls (VE07) or bookshops (VE12). 39: all restaurants. */
export const TYPES = [
  { id: "12", category: "tourist attraction", max: 5, keep: /^(NA|HS|VE)/ },
  { id: "14", category: "cultural venue", max: 3, keep: /^VE0[1-6]/ },
  { id: "39", category: "restaurant", max: 2, keep: /./ },
];
/** Company names ("주식회사 ...", "(주)") and chain branches ("런닝맨 부산점", "... 해운대점") are no local spots. */
export const NOT_A_SPOT = /주식회사|\(주\)|\S점$/u;
export const MAX_PER_CITY = 10;
export const ENOUGH_NEW = 20; // new visible spots in WATCH_DAYS (14 d): twice the >= 5/week goal
export const NEAR_ANY_M = 40;
export const PAGE_ROWS = 100;
export const MAX_PAGES = 6;
export const LICENCE = { Type1: "KOGL Type 1", Type3: "KOGL Type 3" };
export const INSERT_KTO_SQL = INSERT_CANDIDATE_SQL.replace("'osm notable places'", "'kto korservice2'");

const str = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** A road address with a building number ("부산광역시 해운대구 센텀중앙로 55 (우동)"), not a bare dong or lot. */
export function exactKoreanAddress(addr1) {
  const a = str(addr1);
  return /\S+(로|길)\s*\d+/u.test(a) ? a.replace(/\s*\([^)]*\)\s*$/u, "") : "";
}

/** KorService2 item -> candidate, or null when it cannot become a public spot (licence, photo host, address, point). */
export function normalizeKor(item, city, type) {
  const licence = LICENCE[item?.cpyrhtDivCd];
  const image = str(item?.firstimage);
  const name = str(item?.title).replace(/\s*\[[^\]]*\]\s*$/u, "");
  const lat = Number(item?.mapy), lng = Number(item?.mapx);
  const address = exactKoreanAddress(item?.addr1);
  if (!licence || !KTO_IMAGE_HOST.test(image) || !name || !address || !Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) return null;
  if (!/^\d+$/.test(String(item.contentid)) || NOT_A_SPOT.test(name) || !type.keep.test(str(item.lclsSystm2))) return null;
  return {
    citySlug: city.slug, placeId: `kto:${item.contentid}`, name, localName: name, address, latitude: lat, longitude: lng,
    mapsUrl: `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`,
    categoryName: type.category,
    categories: ["kto", "korservice2", `kogl:${item.cpyrhtDivCd}`, str(item.lclsSystm3) || str(item.cat3)].filter(Boolean),
    image: image.replace(/^http:/, "https:"), created: str(item.createdtime),
  };
}

/** Per type: newest first, capped at type.max; then in TYPES order up to MAX_PER_CITY. */
export function pickKor(byType, limit = MAX_PER_CITY) {
  const out = [];
  for (const type of TYPES) {
    const list = [...(byType[type.id] ?? [])].sort((a, b) => b.created.localeCompare(a.created)).slice(0, type.max);
    out.push(...list);
  }
  return out.slice(0, limit);
}

/** Fresh = not a known candidate, not the same name nearby, no spot of any name within NEAR_ANY_M. */
export function isFresh(c, known, spots) {
  if (known.has(c.placeId)) return false;
  const point = { lat: c.latitude, lng: c.longitude };
  if (spots.some((s) => distanceKm(point, s) * 1000 <= NEAR_ANY_M)) return false;
  return !isListed({ ...c, ...point }, spots);
}

async function korList(lDongRegnCd, contentTypeId, pageNo) {
  const url = new URL(KOR);
  for (const [k, v] of Object.entries({ MobileOS: "ETC", MobileApp: "Localley", _type: "json", arrange: "R", numOfRows: String(PAGE_ROWS),
    pageNo: String(pageNo), lDongRegnCd, contentTypeId })) url.searchParams.set(k, v);
  // The key is appended last so errors and logs never contain it.
  const response = await fetch(`${url}&serviceKey=${process.env.DATA_GO_KR_PROJECT_KEY}`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`KorService2 HTTP ${response.status}`);
  const body = (await response.json().catch(() => null))?.response?.body;
  if (!body) throw new Error("KorService2 bad response");
  const items = body.items?.item ?? [];
  return { items: Array.isArray(items) ? items : [items], total: Number(body.totalCount) || 0 };
}

export async function run({ apply = false, city: onlyCity = null, now = new Date(), log = console.log } = {}) {
  if (!process.env.DATA_GO_KR_PROJECT_KEY) throw new Error("DATA_GO_KR_PROJECT_KEY missing");
  const date = now.toISOString().slice(0, 10);
  const cities = parseCityList(readFileSync(join(ROOT, "lib/cities.ts"), "utf8"));
  const since = new Date(now.getTime() - WATCH_DAYS * 86400000).toISOString();
  const korean = Object.values(cities).filter((c) => REGION[c.name] && WATCH_CITIES.includes(c.name) && (!onlyCity || c.slug === onlyCity));
  const out = { date, cities: {}, inserted: 0 };
  let runId = null;
  for (const city of korean) {
    const stat = { found: 0, usable: 0, fresh: 0, inserted: 0 };
    out.cities[city.slug] = stat;
    const recent = (await d1("SELECT count(*) n FROM spots WHERE visible = 1 AND city = ? AND created_at >= ?", [city.name, since]))[0]?.n ?? 0;
    const pending = (await d1("SELECT count(*) n FROM apify_spot_candidates WHERE status = 'pending' AND city_slug = ?", [city.slug]))[0]?.n ?? 0;
    stat.recent = recent; stat.pending = pending;
    if (recent >= ENOUGH_NEW) { stat.skipped = "enough new spots"; continue; }
    const spots = (await d1("SELECT name, latitude lat, longitude lng FROM spots WHERE city = ?", [city.name])).flatMap((r) => {
      let n = { en: r.name }; try { n = JSON.parse(r.name) ?? n; } catch { /* plain text name */ }
      const point = { lat: Number(r.lat), lng: Number(r.lng) };
      return [n.en, n.ko].filter(Boolean).map((name) => ({ name, ...point }));
    });
    const byType = {};
    try {
      for (const type of TYPES) {
        const usable = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
          const { items, total } = await korList(REGION[city.name], type.id, page);
          stat.found += items.length;
          usable.push(...items.map((item) => normalizeKor(item, city, type)).filter(Boolean));
          if (page * PAGE_ROWS >= total) break;
        }
        stat.usable += usable.length;
        const known = await knownIds(usable.map((c) => c.placeId));
        byType[type.id] = usable.filter((c) => distanceKm(city, { lat: c.latitude, lng: c.longitude }) <= 50 && isFresh(c, known, spots));
        stat.fresh += byType[type.id].length;
      }
    } catch (e) { stat.error = e.message; continue; }
    // Pending rows still wait for the promoter: top up to MAX_PER_CITY, never more.
    for (const c of pickKor(byType, Math.max(0, MAX_PER_CITY - pending))) {
      if (!apply) { log(`would insert: ${city.name} | ${c.name} | ${c.categoryName} | ${c.address} | ${c.image}`); continue; }
      runId ??= await dayRunId(date);
      const added = await d1(INSERT_KTO_SQL, [runId, c.citySlug, c.placeId, c.name, c.address, c.latitude, c.longitude, c.mapsUrl, c.categoryName,
        JSON.stringify(c.categories), c.image, SOURCE_TYPE]).catch((e) => { stat.error = `insert: ${e.message}`; return null; });
      if (!added) break;
      if (added.length) { stat.inserted++; out.inserted++; }
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const out = await run({ apply: args.includes("--apply"), city: opt("--city") });
  console.log(`${new Date().toISOString()} kto discovery${args.includes("--apply") ? "" : " (dry run)"}: ${JSON.stringify(out)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((e) => { console.error(`kto discovery failed: ${e.message}`); process.exitCode = 1; });
