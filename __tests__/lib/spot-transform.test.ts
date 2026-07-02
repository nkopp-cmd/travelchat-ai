import { describe, expect, it } from "vitest";
import { transformSpot, type RawSpot } from "@/lib/spots/transform";

function makeRawSpot(overrides: Partial<RawSpot> = {}): RawSpot {
    return {
        id: "spot_1",
        name: { en: "Ikseon Tea Room" },
        description: { en: "A compact tea room hidden in an old alley." },
        address: { en: "17 Supyo-ro 28-gil, Jongno-gu, Seoul" },
        category: "Cafe",
        subcategories: ["Tea"],
        location: { coordinates: [126.9908, 37.5744] },
        localley_score: 5,
        local_percentage: 88,
        best_time: "Late afternoon",
        photos: null,
        google_place_id: "ChIJabc123",
        tips: ["Go before the dinner rush."],
        verified: true,
        trending_score: 0.2,
        ...overrides,
    };
}

describe("transformSpot", () => {
    it("marks normalized Google Places media URLs as real display photos", () => {
        const spot = transformSpot(
            makeRawSpot({
                photos: [
                    "https://places.googleapis.com/v1/places/ChIJabc123/photos/photo456/media?maxWidthPx=800&key=old",
                ],
            })
        );

        expect(spot.photos).toEqual([
            "/api/places/photo?w=1200&v=2&name=places%2FChIJabc123%2Fphotos%2Fphoto456",
        ]);
        expect(spot.hasRealPhoto).toBe(true);
        expect(spot.googlePlaceId).toBe("ChIJabc123");
    });

    it("keeps placeholder fallback photos marked as not real", () => {
        const spot = transformSpot(
            makeRawSpot({
                photos: ["/images/placeholders/default.svg"],
            })
        );

        expect(spot.photos).toEqual(["/images/placeholders/cafe.svg"]);
        expect(spot.hasRealPhoto).toBe(false);
    });

    it("does not expose mismatched place ids as verified card targets", () => {
        const spot = transformSpot(
            makeRawSpot({
                google_place_id: "ChIJ-stale-place",
                photos: [
                    "https://places.googleapis.com/v1/places/ChIJ-real-photo-place/photos/photo456/media?maxWidthPx=800&key=old",
                ],
            })
        );

        expect(spot.photos).toEqual([
            "/api/places/photo?w=1200&v=2&name=places%2FChIJ-real-photo-place%2Fphotos%2Fphoto456",
        ]);
        expect(spot.hasRealPhoto).toBe(true);
        expect(spot.googlePlaceId).toBeNull();
    });
});
