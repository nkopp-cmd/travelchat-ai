// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
import { describe, expect, it } from "vitest";
import { inferCityFromAddress } from "@/lib/cities";
import { ewkbPoint } from "@/lib/app-data/ewkb";
import { listingPlaceFor } from "@/lib/spots/listing-place";
import { getPublicSpotQualityIssue } from "@/lib/spots/public-quality";
// @ts-expect-error plain ESM script without types
import { exactKoreanAddress, INSERT_KTO_SQL, isFresh, normalizeKor, pickKor, TYPES } from "../../scripts/discover-kto-places.mjs";
// @ts-expect-error plain ESM script without types
import { SOURCE_TYPE } from "../../scripts/discover-osm-places.mjs";
// @ts-expect-error plain ESM script without types
import { buildCandidateRows, candidateStatements, gateCandidate, ktoLicence, parseCities } from "../../scripts/promote-candidates.mjs";

const cities = parseCities(readFileSync("lib/cities.ts", "utf8"));

const busan = { slug: "busan", name: "Busan", lat: 35.1796, lng: 129.0756 };
const [sights, culture, food] = TYPES;
const item = (over: Record<string, unknown> = {}) => ({
    contentid: "3545402", title: "금빛노을브릿지", addr1: "부산광역시 북구 낙동대로 1769 (덕천동)", mapx: "128.9967", mapy: "35.2105",
    firstimage: "http://tong.visitkorea.or.kr/cms/resource/02/3545402_image2_1.jpg", cpyrhtDivCd: "Type1",
    lclsSystm2: "VE01", lclsSystm3: "VE010300", cat3: "", createdtime: "20250929120000", ...over,
});

describe("discover-kto-places", () => {
    it("keeps a road address with a building number and drops the dong suffix", () => {
        expect(exactKoreanAddress("부산광역시 해운대구 센텀중앙로 55 (우동)")).toBe("부산광역시 해운대구 센텀중앙로 55");
        expect(exactKoreanAddress("부산광역시 수영구 광남로48번길 29")).toBe("부산광역시 수영구 광남로48번길 29");
        expect(exactKoreanAddress("부산광역시 기장군 기장읍")).toBe("");
        expect(exactKoreanAddress("")).toBe("");
    });

    it("turns a KorService2 item into a candidate with the KTO photo over https and its KOGL tag", () => {
        const c = normalizeKor(item(), busan, sights);
        expect(c).toMatchObject({ citySlug: "busan", placeId: "kto:3545402", name: "금빛노을브릿지", address: "부산광역시 북구 낙동대로 1769",
            latitude: 35.2105, longitude: 128.9967, categoryName: "tourist attraction",
            image: "https://tong.visitkorea.or.kr/cms/resource/02/3545402_image2_1.jpg" });
        expect(c.categories).toEqual(["kto", "korservice2", "kogl:Type1", "VE010300"]);
        expect(c.mapsUrl).toMatch(/^https:\/\/map\.kakao\.com\/link\/map\//);
    });

    it("drops items that cannot become a public spot", () => {
        expect(normalizeKor(item({ cpyrhtDivCd: "Type4" }), busan, sights)).toBeNull(); // not a free licence
        expect(normalizeKor(item({ firstimage: "" }), busan, sights)).toBeNull();
        expect(normalizeKor(item({ firstimage: "https://example.com/a.jpg" }), busan, sights)).toBeNull();
        expect(normalizeKor(item({ addr1: "부산광역시 북구" }), busan, sights)).toBeNull();
        expect(normalizeKor(item({ mapy: "0" }), busan, sights)).toBeNull();
        expect(normalizeKor(item({ lclsSystm2: "EX05", title: "하버요가&무브먼트" }), busan, sights)).toBeNull(); // experience business
        expect(normalizeKor(item({ title: "주식회사 놀핏" }), busan, sights)).toBeNull();
        expect(normalizeKor(item({ title: "런닝맨 부산점", lclsSystm2: "VE03" }), busan, culture)).toBeNull(); // chain branch
        expect(normalizeKor(item({ lclsSystm2: "VE09" }), busan, culture)).toBeNull(); // library
        expect(normalizeKor(item({ lclsSystm2: "FD01" }), busan, food)).not.toBeNull();
    });

    it("picks newest first per type, capped per type and per run", () => {
        const many = (n: number, type: { id: string }) => Array.from({ length: n }, (_, i) => ({ placeId: `${type.id}-${i}`, created: `2026${String(10 + i)}` }));
        const picked = pickKor({ 12: many(9, sights), 14: many(9, culture), 39: many(9, food) });
        expect(picked).toHaveLength(10);
        expect(picked.filter((c: { placeId: string }) => c.placeId.startsWith("12-"))).toHaveLength(5);
        expect(picked[0].placeId).toBe("12-8");
        expect(pickKor({ 12: many(9, sights) }, 3)).toHaveLength(3);
        expect(pickKor({}, 10)).toEqual([]);
    });

    it("treats a known id, the same name nearby or any spot within 40 m as already listed", () => {
        const c = normalizeKor(item(), busan, sights);
        expect(isFresh(c, new Set(), [])).toBe(true);
        expect(isFresh(c, new Set(["kto:3545402"]), [])).toBe(false);
        expect(isFresh(c, new Set(), [{ name: "Some Bridge", lat: 35.2106, lng: 128.9967 }])).toBe(false); // ~11 m
        expect(isFresh(c, new Set(), [{ name: "금빛노을브릿지", lat: 35.2125, lng: 128.9967 }])).toBe(false); // ~220 m, same name
        expect(isFresh(c, new Set(), [{ name: "Other", lat: 35.2125, lng: 128.9967 }])).toBe(true);
    });

    it("tags inserted rows with their own discovery query", () => {
        expect(INSERT_KTO_SQL).toContain("'kto korservice2'");
        expect(INSERT_KTO_SQL).not.toContain("'osm notable places'");
    });
});

describe("KTO candidate through the real D1 schema and the promoter", () => {
    it("stores the row once, passes the gate (KTO listing = signal, KTO photo required) and builds public rows without a Google listing", () => {
        const d1 = new D1Sqlite();
        const dir = path.resolve(__dirname, "../../migrations/app-preview");
        for (const file of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) d1.sqlite.exec(readFileSync(path.join(dir, file), "utf8"));
        d1.sqlite.prepare(`INSERT INTO apify_spot_discovery_runs (id, discovery_date, city_slug, actor_id, actor_run_id, state, max_places, completed_at)
            VALUES ('run1', '2026-11-28', 'osm-multi', 'osm-overpass', 'osm:2026-11-28:run1', 'succeeded', 100, '2026-11-28T04:39:00.000Z')`).run();
        const c = normalizeKor(item(), busan, sights);
        const params = ["run1", c.citySlug, c.placeId, c.name, c.address, c.latitude, c.longitude, c.mapsUrl, c.categoryName, JSON.stringify(c.categories), c.image, SOURCE_TYPE];
        expect(d1.sqlite.prepare(INSERT_KTO_SQL).all(...params)).toHaveLength(1);
        expect(d1.sqlite.prepare(INSERT_KTO_SQL).all(...params)).toHaveLength(0);
        const row = { ...(d1.sqlite.prepare("SELECT * FROM apify_spot_candidates").get() as Record<string, unknown>), id: "cand-kto" };
        expect(row).toMatchObject({ status: "pending", place_id: "kto:3545402", discovery_query: "kto korservice2" });
        expect(ktoLicence(row)).toBe("KOGL Type 1");
        expect(gateCandidate(row, cities).ok).toBe(true);
        expect(gateCandidate({ ...row, categories: JSON.stringify(["kto"]) }, cities).reject).toBe("weak_signal");
        expect(gateCandidate({ ...row, primary_image_url: "https://example.com/a.jpg" }, cities).reject).toBe("no_photo");
        expect(gateCandidate({ ...row, categories: JSON.stringify(["kto", "korservice2"]) }, cities).reject).toBe("no_photo");

        const copy = { nameEn: "Geumbit Noeul Bridge", descriptionEn: "A sunset bridge.", category: "Nature", subcategories: ["Viewpoint"],
            tipsEn: ["Go at sunset"], bestTimesEn: "Evening", addressEn: "1769 Nakdong-daero, Buk-gu, Busan, South Korea", exactAddress: true, localPercentage: 70 };
        const id = "0b6f6a52-6f0e-4d36-9a54-0d5f6a2b1c3d", sha = "c".repeat(64);
        const photo = { r2Key: `spot-photos/${id}/${sha}.webp`, path: `/media/spot/${id}/${sha}.webp`, source: "kto", licence: "KOGL Type 1",
            author: "Korea Tourism Organization", sourceUrl: "https://api.visitkorea.or.kr/#/useKoreaGuide", width: 1600, height: 1067, approvedBy: "harvester-kto-korservice2" };
        const rows = buildCandidateRows({ id, c: row, city: cities.busan, copy, photo });
        expect(rows.listing).toBeNull();
        expect(rows.spot.google_place_id).toBeNull();
        const spot = { name: rows.spot.name, address: rows.spot.address_json, location: ewkbPoint(rows.spot.longitude, rows.spot.latitude),
            photos: rows.spot.photos, google_place_id: rows.spot.google_place_id };
        expect(getPublicSpotQualityIssue(spot)).toBeNull();
        expect(listingPlaceFor(spot)).toBeNull();
        expect(inferCityFromAddress(rows.spot.address_json.en)?.name).toBe("Busan");
        const last = candidateStatements(rows).at(-1);
        expect(last.sql).toContain("INSERT INTO spot_photos");
        expect(last.params.slice(0, 4)).toEqual([photo.r2Key, id, "kto", "KOGL Type 1"]);
    });
});
