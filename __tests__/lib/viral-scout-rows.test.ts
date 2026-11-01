import { describe, expect, it } from "vitest";
import { inferCityFromAddress } from "@/lib/cities";
import { ewkbPoint } from "@/lib/app-data/ewkb";
import { listingPlaceFor } from "@/lib/spots/listing-place";
import { getPublicSpotQualityIssue, PUBLIC_SPOT_VISIBILITY_CACHE_VERSION } from "@/lib/spots/public-quality";
// The scout writes over the D1 REST API, outside the facade write hook, so it computes the derived columns itself.
// This test runs the app's real rules on the rows it builds: drift fails here, not in production.
// @ts-expect-error plain ESM script without types
import { buildSpotRows, ewkbPoint as scoutEwkb, VISIBILITY_VERSION } from "../../scripts/viral-scout.mjs";

const candidate = {
    key: "justin-bieber-seoul-2026-10:도산회관", city: "seoul", personEn: "Justin Bieber", note: "ate samgyetang", kind: "restaurant",
    naver: { title: "도산회관", roadAddress: "서울특별시 강남구 도산대로45길 8-7", jibunAddress: "", category: "한식", lat: 37.5226, lng: 127.0371, confidence: "high" },
};
const copy = {
    nameEn: "Dosan Hoegwan", descriptionEn: "A samgyetang house.", category: "Food", subcategories: ["Korean"], tipsEn: ["Go early"],
    bestTimesEn: "Lunch", addressEn: "8-7 Dosan-daero 45-gil, Gangnam-gu, Seoul, South Korea", localPercentage: 60,
};

describe("viral scout spot rows", () => {
    const rows = buildSpotRows({ candidate, copy, placeId: "ChIJKSeave2jfDURRQ0ZYtkO1t4", sourceUrls: ["https://www.mt.co.kr/a/1"] });

    it("match the columns the spots write hook derives", () => {
        const spot = {
            name: rows.spot.name, address: rows.spot.address_json, location: ewkbPoint(rows.spot.longitude, rows.spot.latitude),
            photos: rows.spot.photos, google_place_id: rows.spot.google_place_id,
        };
        expect(getPublicSpotQualityIssue(spot)).toBeNull();
        expect(rows.spot.visible).toBe(1);
        expect(rows.spot.city).toBe(inferCityFromAddress(rows.spot.address_json.en)?.name);
        expect(rows.spot.address).toBe(rows.spot.address_json.en);
        expect(VISIBILITY_VERSION).toBe(PUBLIC_SPOT_VISIBILITY_CACHE_VERSION);
        expect(rows.spot.visibility_version).toBe(PUBLIC_SPOT_VISIBILITY_CACHE_VERSION);
        expect(listingPlaceFor(spot)).toEqual({ placeId: rows.listing.place_id, source: rows.listing.source });
        expect(scoutEwkb(127.0371, 37.5226)).toBe(ewkbPoint(127.0371, 37.5226));
        expect(rows.payload.location).toBe(spot.location);
    });

    it("is hidden by the app rule when the address is not exact", () => {
        const loose = buildSpotRows({ candidate, copy: { ...copy, addressEn: "Gangnam-gu, Seoul, South Korea" }, placeId: "ChIJKSeave2jfDURRQ0ZYtkO1t4", sourceUrls: [] });
        expect(getPublicSpotQualityIssue({ name: loose.spot.name, address: loose.spot.address_json, photos: [], google_place_id: loose.spot.google_place_id,
            location: ewkbPoint(loose.spot.longitude, loose.spot.latitude) })).not.toBeNull();
    });
});
