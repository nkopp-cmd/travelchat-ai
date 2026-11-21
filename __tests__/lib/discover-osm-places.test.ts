// @vitest-environment node
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
import { describe, expect, it } from "vitest";
import { inferCityFromAddress } from "@/lib/cities";
import { ewkbPoint } from "@/lib/app-data/ewkb";
import { listingPlaceFor } from "@/lib/spots/listing-place";
import { getPublicSpotQualityIssue } from "@/lib/spots/public-quality";
// @ts-expect-error plain ESM script without types
import { isListed, wikidataId, MAX_CONSIDER, MAX_WORSHIP_PER_CITY, normalizeOsm, osmAddress, overpassQuery, pickCities, rankCandidates, reverseAddress, SOURCE_TYPE, INSERT_CANDIDATE_SQL, candidateParams } from "../../scripts/discover-osm-places.mjs";
// @ts-expect-error plain ESM script without types
import { buildCandidateRows, candidateStatements, gateCandidate, parseCities } from "../../scripts/promote-candidates.mjs";
// @ts-expect-error plain ESM script without types
import { parseCityList } from "../../scripts/discover-new-places.mjs";
// @ts-expect-error plain ESM script without types
import { insertStatements } from "../../scripts/viral-scout.mjs";

const list = parseCityList(readFileSync("lib/cities.ts", "utf8"));
const cities = parseCities(readFileSync("lib/cities.ts", "utf8"));
const bkk = list.bangkok;
const museum = {
    type: "node", id: 123, lat: 13.7466, lon: 100.5332,
    tags: { name: "พิพิธภัณฑ์", "name:en": "Bangkok Folk Museum", wikidata: "Q1", "wikipedia:th": "x", tourism: "museum",
        "addr:housenumber": "254", "addr:street": "Phaya Thai Road", "addr:district": "Pathum Wan" },
};

describe("discover-osm-places", () => {
    it("asks Overpass only for named, wikidata-tagged places around the city", () => {
        const q = overpassQuery(bkk);
        expect(q).toContain(`around:15000,${bkk.lat},${bkk.lng}`);
        expect(q).toContain('["name"]["wikidata"]');
        expect(q).not.toMatch(/hotel/);
    });

    it("normalizes a notable place with its OSM address", () => {
        expect(normalizeOsm(museum, bkk)).toMatchObject({
            placeId: "osm:node/123", citySlug: "bangkok", name: "Bangkok Folk Museum", categoryName: "museum",
            address: "254 Phaya Thai Road, Pathum Wan, Bangkok, Thailand", mapsUrl: "https://www.openstreetmap.org/node/123",
            categories: ["museum", "wikipedia", "wikidata:Q1"],
        });
        const way = { type: "way", id: 9, center: { lat: 13.75, lon: 100.5 }, tags: { ...museum.tags } };
        expect(normalizeOsm(way, bkk)?.placeId).toBe("osm:way/9");
    });

    it("drops places without a Wikipedia article, name, known kind, or inside the city", () => {
        const noWiki = Object.fromEntries(Object.entries(museum.tags).filter(([k]) => k !== "wikipedia:th"));
        expect(normalizeOsm({ ...museum, tags: noWiki }, bkk)).toBeNull();
        expect(normalizeOsm({ ...museum, tags: { ...museum.tags, name: "", "name:en": "" } }, bkk)).toBeNull();
        expect(normalizeOsm({ ...museum, tags: { ...museum.tags, tourism: "hotel" } }, bkk)).toBeNull();
        expect(normalizeOsm({ ...museum, tags: { ...museum.tags, tourism: "information" } }, bkk)).toBeNull();
        expect(normalizeOsm({ ...museum, lat: 13.0, lon: 101.5 }, bkk)).toBeNull(); // > 50 km
        expect(normalizeOsm({ ...museum, type: "area" }, bkk)).toBeNull();
    });

    it("needs a house number and street for an address", () => {
        expect(osmAddress({ "addr:street": "Rama I Road" }, bkk)).toBe("");
        expect(reverseAddress({ address: { road: "Rama I Road" } }, bkk)).toBe("");
        expect(reverseAddress({ address: { house_number: "991", road: "Rama I Road", suburb: "Pathum Wan" } }, bkk))
            .toBe("991 Rama I Road, Pathum Wan, Bangkok, Thailand");
    });

    it("accepts a Japanese address without a street only with block/house numbers", () => {
        const tokyo = list.tokyo, kyoto = list.kyoto;
        // Nominatim 2026-11-21, Sensō-ji area and Kinkaku-ji
        expect(reverseAddress({ address: { house_number: "1", administrative: "Asakusa 2", quarter: "Asakusa", city: "Taito", postcode: "111-0032", country_code: "jp" } }, tokyo))
            .toBe("Asakusa 2-1, Taito, 111-0032, Tokyo, Japan");
        expect(osmAddress({ "addr:quarter": "Ginza 4", "addr:block_number": "6", "addr:housenumber": "16", "addr:suburb": "Chuo" }, tokyo))
            .toBe("Ginza 4-6-16, Chuo, Tokyo, Japan");
        // area + postcode without numbers: the promoter rejects it (inexact_address), so discovery skips it
        expect(reverseAddress({ address: { amenity: "Kinkaku-ji", neighbourhood: "Kinkakuji-chō", suburb: "Kita Ward", city: "Kyoto", postcode: "603-8361" } }, kyoto)).toBe("");
        expect(osmAddress({ "addr:quarter": "Kitazawa", "addr:suburb": "Setagaya", "addr:postcode": "155-8666" }, tokyo)).toBe("");
        // no numbers, or no area at all: still not exact
        expect(reverseAddress({ address: { neighbourhood: "Kinkakuji-chō", city: "Kyoto" } }, kyoto)).toBe("");
        expect(reverseAddress({ address: { house_number: "3", postcode: "603-8361" } }, kyoto)).toBe("");
        expect(osmAddress({ "addr:quarter": "Kichijoji Honcho", "addr:postcode": "180-0000" }, tokyo)).toBe("");
        // outside Japan the street rule stays
        expect(reverseAddress({ address: { house_number: "1", administrative: "Asakusa 2", postcode: "111-0032" } }, bkk)).toBe("");
    });

    it("keeps variety: places of worship are capped and come last", () => {
        const mk = (id: number, kind: string) => ({ placeId: `osm:node/${id}`, categories: [kind, "wikipedia"] });
        const temples = Array.from({ length: 20 }, (_, i) => mk(i, "place_of_worship"));
        const out = rankCandidates([...temples, mk(100, "museum"), mk(100, "museum"), null, mk(101, "park")]);
        expect(out.slice(0, 2).map((c: { placeId: string }) => c.placeId)).toEqual(["osm:node/100", "osm:node/101"]);
        expect(out).toHaveLength(2 + MAX_WORSHIP_PER_CITY);
        expect(rankCandidates(Array.from({ length: 500 }, (_, i) => mk(i, "museum")))).toHaveLength(MAX_CONSIDER);
    });

    it("picks the watch cities with the fewest new spots, skipping recent queries", () => {
        const now = new Date("2026-11-16T05:00:00Z");
        const fresh = { Seoul: 24, Tokyo: 51, Singapore: 29 };
        expect(pickCities(list, fresh, {}, now).map((c: { slug: string }) => c.slug)).toEqual(["bangkok", "taipei", "osaka"]);
        expect(pickCities(list, fresh, { bangkok: "2026-11-15", taipei: "2026-11-01" }, now).map((c: { slug: string }) => c.slug))
            .toEqual(["taipei", "osaka", "kyoto"]);
    });

    it("finds an existing spot by name within 300 m (English or local name)", () => {
        const c = { name: "Wat Arun", localName: "วัดอรุณราชวราราม", lat: 13.7437, lng: 100.4889 };
        expect(isListed(c, [{ name: "Wat Arun Ratchawararam", lat: 13.7440, lng: 100.4890 }])).toBe(true);
        expect(isListed(c, [{ name: "วัดอรุณราชวราราม", lat: 13.7437, lng: 100.4889 }])).toBe(true);
        expect(isListed(c, [{ name: "Wat Arun", lat: 13.76, lng: 100.4889 }])).toBe(false); // ~1.8 km away
        expect(isListed(c, [{ name: "Wat Pho", lat: 13.7437, lng: 100.4889 }])).toBe(false);
    });

    it("reads the Wikidata id from the categories", () => {
        expect(wikidataId(normalizeOsm(museum, bkk))).toBe("Q1");
        expect(wikidataId({ categories: ["museum"] })).toBeNull();
    });

    it("promotes an OSM row: Wikipedia link is the signal, Commons photo is required, no Google listing row, public rules pass", () => {
        const n = normalizeOsm(museum, bkk);
        const c = { id: "cand-osm", city_slug: n.citySlug, place_id: n.placeId, name: n.name, address: n.address, latitude: n.latitude,
            longitude: n.longitude, maps_url: n.mapsUrl, category_name: n.categoryName, categories: JSON.stringify(n.categories),
            total_score: null, reviews_count: null, recommended_localley_score: 3, source_type: SOURCE_TYPE,
            primary_image_url: "https://commons.wikimedia.org/wiki/File:Bangkok_Folk_Museum.jpg" };
        expect(gateCandidate(c, cities).ok).toBe(true);
        expect(gateCandidate({ ...c, categories: JSON.stringify(["museum"]) }, cities).reject).toBe("weak_signal");
        expect(gateCandidate({ ...c, place_id: "ChIJ-google-place" }, cities).reject).toBe("weak_signal");
        expect(gateCandidate({ ...c, primary_image_url: null }, cities).reject).toBe("no_photo");
        expect(gateCandidate({ ...c, primary_image_url: "https://example.com/x.jpg" }, cities).reject).toBe("no_photo");
        const copy = { nameEn: "Bangkok Folk Museum", descriptionEn: "A small museum.", category: "Culture", subcategories: ["Museum"],
            tipsEn: ["Go early"], bestTimesEn: "Morning", addressEn: "254 Phaya Thai Road, Pathum Wan, Bangkok, Thailand", exactAddress: true, localPercentage: 50 };
        const id = "0b6f6a52-6f0e-4d36-9a54-0d5f6a2b1c3d";
        const sha = "a".repeat(64);
        const photo = { r2Key: `spot-photos/${id}/${sha}.webp`, path: `/media/spot/${id}/${sha}.webp`, licence: "CC BY-SA 4.0",
            author: "Jane Doe", sourceUrl: c.primary_image_url, width: 1600, height: 1067 };
        const bare = buildCandidateRows({ id, c, city: cities.bangkok, copy });
        expect(getPublicSpotQualityIssue({ name: bare.spot.name, address: bare.spot.address_json,
            location: ewkbPoint(bare.spot.longitude, bare.spot.latitude), photos: bare.spot.photos, google_place_id: null })).toBe("missing_real_photo");
        const rows = buildCandidateRows({ id, c, city: cities.bangkok, copy, photo });
        expect(rows.spot.photos).toEqual([photo.path]);
        expect(rows.payload.photos).toEqual([photo.path]);
        expect(rows.listing).toBeNull();
        expect(rows.spot.google_place_id).toBeNull();
        expect(rows.spot.source_urls).toEqual(["https://www.openstreetmap.org/node/123"]);
        const spot = { name: rows.spot.name, address: rows.spot.address_json, location: ewkbPoint(rows.spot.longitude, rows.spot.latitude),
            photos: rows.spot.photos, google_place_id: rows.spot.google_place_id };
        expect(getPublicSpotQualityIssue(spot)).toBeNull();
        expect(listingPlaceFor(spot)).toBeNull();
        expect(inferCityFromAddress(rows.spot.address_json.en)?.name).toBe("Bangkok");
        const statements = candidateStatements(rows);
        const sql = statements.map((s: { sql: string }) => s.sql).join("\n");
        expect(sql).not.toContain("spot_listing_places");
        expect(sql).toContain("INSERT INTO spots");
        expect(sql).toContain("_journal");
        const last = statements.at(-1);
        expect(last.sql).toContain("INSERT INTO spot_photos");
        expect(last.params.slice(0, 2)).toEqual([photo.r2Key, id]);
        expect(last.params).toContain("harvester-osm-p18");
        expect(candidateStatements(bare)).toEqual(insertStatements(bare));
    });
});

describe("OSM candidate insert against the real D1 schema", () => {
    it("stores the row (the source_type CHECK passes), skips a known place_id, and the promoter still sees it as OSM", () => {
        const d1 = new D1Sqlite();
        const dir = path.resolve(__dirname, "../../migrations/app-preview");
        for (const file of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) d1.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
        d1.sqlite.prepare(`INSERT INTO apify_spot_discovery_runs (id, discovery_date, city_slug, actor_id, actor_run_id, state, max_places, completed_at)
            VALUES ('run1', '2026-11-17', 'osm-multi', 'osm-overpass', 'osm:2026-11-17:run1', 'succeeded', 100, '2026-11-17T04:39:00.000Z')`).run();
        const n = normalizeOsm(museum, bkk);
        const c = { ...n, address: "1 Charoen Krung Rd, Bang Rak, Bangkok, Thailand" };
        const image = "https://commons.wikimedia.org/wiki/File:Bangkok_Folk_Museum.jpg";
        const insert = () => d1.sqlite.prepare(INSERT_CANDIDATE_SQL).all(...candidateParams("run1", c, image));
        expect(insert()).toHaveLength(1);
        expect(insert()).toHaveLength(0); // ON CONFLICT (place_id) DO NOTHING
        const row = d1.sqlite.prepare("SELECT * FROM apify_spot_candidates").get() as Record<string, unknown>;
        expect(row).toMatchObject({ status: "pending", source_type: SOURCE_TYPE, place_id: n.placeId });
        expect(gateCandidate({ ...row, id: "cand-osm" }, cities).ok).toBe(true);
        // A bad row fails loudly instead of being ignored.
        expect(() => d1.sqlite.prepare(INSERT_CANDIDATE_SQL).all(...candidateParams("run1", { ...c, placeId: "osm:node/9", latitude: 999 }, image))).toThrow();
    });
});
