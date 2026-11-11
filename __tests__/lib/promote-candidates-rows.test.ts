import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_CITIES as APP_CITIES, inferCityFromAddress } from "@/lib/cities";
import { ewkbPoint } from "@/lib/app-data/ewkb";
import { listingPlaceFor } from "@/lib/spots/listing-place";
import { getPublicSpotQualityIssue, PUBLIC_SPOT_VISIBILITY_CACHE_VERSION } from "@/lib/spots/public-quality";
// The promoter writes over the D1 REST API (outside the facade write hook): this runs the app's real rules on its rows.
// @ts-expect-error plain ESM script without types
import { buildCandidateRows, exactAddress, gateCandidate, parseCities, parseCopy, WATCH_CITIES, watchLine } from "../../scripts/promote-candidates.mjs";

const cities = parseCities(readFileSync("lib/cities.ts", "utf8"));
const candidate = {
    id: "cand-1", city_slug: "chiang-mai", place_id: "ChIJ3eN5h7Y62jARt9yJ0bm_h1o", name: "ร้านข้าวซอยแม่มณี", address: "91 ถ. ศรีภูมิ ตำบลศรีภูมิ เมือง เชียงใหม่ 50200",
    latitude: 18.7952, longitude: 98.9882, maps_url: "https://www.google.com/maps/place/?q=place_id:ChIJ3eN5h7Y62jARt9yJ0bm_h1o", category_name: "Thai restaurant",
    categories: JSON.stringify(["Thai restaurant", "Noodle shop"]), total_score: 4.6, reviews_count: 812, recommended_localley_score: 4, source_type: "map_discovery",
    primary_image_url: "https://lh3.googleusercontent.com/p/AF1Qip-example",
};
const copy = {
    nameEn: "Khao Soi Mae Manee", descriptionEn: "A khao soi shop.", category: "Food", subcategories: ["Thai"], tipsEn: ["Go early"],
    bestTimesEn: "Lunch", addressEn: "91 Sri Poom Rd, Si Phum, Chiang Mai, Thailand", exactAddress: true, localPercentage: 60,
};

describe("candidate promoter", () => {
    it("parses every city of lib/cities.ts", () => {
        expect(Object.keys(cities).sort()).toEqual(APP_CITIES.map((c) => c.slug).sort());
        for (const c of APP_CITIES) expect(cities[c.slug]).toMatchObject({ name: c.name, country: c.country, lat: c.center.lat, lng: c.center.lng });
    });

    it("builds rows the app shows publicly, without a stored Google photo", () => {
        const rows = buildCandidateRows({ c: candidate, city: cities["chiang-mai"], copy });
        const spot = { name: rows.spot.name, address: rows.spot.address_json, location: ewkbPoint(rows.spot.longitude, rows.spot.latitude),
            photos: rows.spot.photos, google_place_id: rows.spot.google_place_id };
        expect(getPublicSpotQualityIssue(spot)).toBeNull();
        expect(rows.spot.city).toBe("Chiang Mai");
        expect(rows.spot.city).toBe(inferCityFromAddress(rows.spot.address_json.en)?.name);
        expect(rows.spot.visibility_version).toBe(PUBLIC_SPOT_VISIBILITY_CACHE_VERSION);
        expect(rows.spot.photos).toEqual([]);
        expect(JSON.stringify(rows)).not.toContain("googleusercontent");
        expect(listingPlaceFor(spot)).toEqual({ placeId: rows.listing.place_id, source: rows.listing.source });
        expect(rows.spot.localley_score).toBe(4);
    });

    it("gates city distance, signal, hotels and duplicates", () => {
        expect(gateCandidate(candidate, cities).ok).toBe(true);
        expect(gateCandidate({ ...candidate, city_slug: "atlantis" }, cities).reject).toBe("unknown_city");
        expect(gateCandidate({ ...candidate, latitude: 13.75, longitude: 100.5 }, cities).reject).toBe("outside_city");
        expect(gateCandidate({ ...candidate, reviews_count: 12 }, cities).reject).toBe("weak_signal");
        expect(gateCandidate({ ...candidate, total_score: 3.9 }, cities).reject).toBe("weak_signal");
        expect(gateCandidate({ ...candidate, category_name: "Hotel" }, cities).reject).toBe("hotel");
        expect(gateCandidate(candidate, cities, { listed: true }).reject).toBe("duplicate");
        expect(gateCandidate(candidate, cities, { nearby: ["ร้านข้าวซอยแม่มณี (Old City)"] }).reject).toBe("duplicate");
        expect(gateCandidate(candidate, cities, { nearby: ["Wat Phra Singh"] }).ok).toBe(true);
    });

    it("accepts only exact addresses that end with the city and country", () => {
        const items = [{ c: candidate, city: cities["chiang-mai"] }];
        const raw = (addressEn: string) => JSON.stringify({ spots: [{ ...copy, key: "cand-1", addressEn }] });
        expect(parseCopy(raw(copy.addressEn), items).get("cand-1")?.exactAddress).toBe(true);
        expect(parseCopy(raw("Si Phum, Chiang Mai, Thailand"), items).get("cand-1")?.exactAddress).toBe(false);
        expect(parseCopy(raw("91 Sri Poom Rd, Si Phum, Bangkok, Thailand"), items).get("cand-1")?.exactAddress).toBe(false);
        expect(parseCopy("not json", items).size).toBe(0);
    });

    it("accepts 3-part street addresses and appends a missing country", () => {
        const jeju = cities.jeju;
        expect(exactAddress("115-2 Tapdong-ro, Jeju, South Korea", jeju)).toBe("115-2 Tapdong-ro, Jeju, South Korea");
        expect(exactAddress("20 Tapdong-ro, Jeju", jeju)).toBe("20 Tapdong-ro, Jeju, South Korea");
        expect(exactAddress("Tapdong-ro, Jeju, South Korea", jeju)).toBe("");
        expect(exactAddress("Jeju, South Korea", jeju)).toBe("");
        expect(exactAddress("20 Tapdong-ro, Seogwipo, South Korea", jeju)).toBe("");
        const items = [{ c: { ...candidate, city_slug: "jeju" }, city: jeju }];
        const copyOf = parseCopy(JSON.stringify({ spots: [{ ...copy, key: "cand-1", addressEn: "20 Tapdong-ro, Jeju" }] }), items).get("cand-1");
        expect(copyOf).toMatchObject({ exactAddress: true, addressEn: "20 Tapdong-ro, Jeju, South Korea" });
        expect(inferCityFromAddress(copyOf!.addressEn)?.name).toBe("Jeju");
    });

    it("alerts on a watched city without new spots or a long queue, else stays silent", () => {
        const all = Object.fromEntries(WATCH_CITIES.map((c: string) => [c, 3]));
        for (const c of WATCH_CITIES) expect(cities[Object.keys(cities).find((k) => cities[k].name === c)!]).toBeTruthy();
        expect(watchLine(all, 50)).toBe("");
        expect(watchLine({ ...all, Tokyo: 0, Busan: undefined }, 12)).toBe("Localley new places: 0 new spots in 14 days: Tokyo, Busan.");
        expect(watchLine(all, 51)).toBe("Localley new places: 51 candidates pending (max 50).");
    });
});
