import { describe, expect, it } from "vitest";
import {
    buildSpotQualityPatchPayload,
    summarizeSpotQualityItems,
    toSpotQualityItem,
    type SpotQualityRow,
} from "@/lib/admin/spot-quality";

function createRow(overrides: Partial<SpotQualityRow> = {}): SpotQualityRow {
    return {
        id: "spot_1",
        name: { en: "Westin Tokyo Garden" },
        address: { en: "Westin Tokyo, Meguro-ku, Tokyo" },
        description: { en: "Quiet garden stop near Ebisu." },
        photos: ["/images/placeholders/default.svg"],
        category: "Outdoor",
        location: "POINT(0 0)",
        google_place_id: null,
        created_at: "2026-06-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("admin spot quality", () => {
    it("classifies records that still need real photos and exact location data", () => {
        const item = toSpotQualityItem(createRow(), true);

        expect(item.publicReady).toBe(false);
        expect(item.issues).toEqual(["missing_real_photo", "inexact_location"]);
        expect(item.locationConfidence.tone).toBe("area");
        expect(item.photoSummary.hasRealPhoto).toBe(false);
    });

    it("tracks missing place identity after a spot has a real photo without a place ID", () => {
        const item = toSpotQualityItem(
            createRow({
                address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
                location: "POINT(139.7580000 35.6950000)",
                photos: ["https://example.com/ladrio.jpg"],
            }),
            true
        );

        expect(item.issues).toEqual(["missing_place_id"]);
        expect(item.publicReady).toBe(false);
    });

    it("builds a safe patch payload for address, coordinates, photos, and place ID", () => {
        const payload = buildSpotQualityPatchPayload(
            createRow(),
            {
                address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
                lat: 35.695,
                lng: 139.758,
                photos: [
                    "/api/places/photo?name=places/ChIJ-test-place/photos/photo_1&w=1200",
                    "/api/places/photo?name=places/ChIJ-test-place/photos/photo_1&w=1200",
                ],
                googlePlaceId: " ChIJ-test-place ",
            },
            true
        );

        expect(payload).toEqual({
            address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
            location: "POINT(139.7580000 35.6950000)",
            photos: ["/api/places/photo?name=places/ChIJ-test-place/photos/photo_1&w=1200"],
            google_place_id: "ChIJ-test-place",
        });
    });

    it("rejects invalid partial coordinates and place IDs before the schema migration", () => {
        expect(() =>
            buildSpotQualityPatchPayload(createRow(), { lat: 35.695 }, true)
        ).toThrow("Provide both valid latitude and longitude values.");

        expect(() =>
            buildSpotQualityPatchPayload(createRow(), { googlePlaceId: "ChIJ-test-place" }, false)
        ).toThrow("spots.google_place_id migration");
    });

    it("summarizes queue issues for dashboard counters", () => {
        const items = [
            toSpotQualityItem(createRow(), true),
            toSpotQualityItem(
                createRow({
                    id: "spot_2",
                    address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
                    location: "POINT(139.7580000 35.6950000)",
                    photos: ["https://example.com/ladrio.jpg"],
                    google_place_id: "ChIJ-test-place",
                }),
                true
            ),
        ];

        expect(summarizeSpotQualityItems(items)).toMatchObject({
            total: 2,
            publicReady: 1,
            needsWork: 1,
            missingRealPhoto: 1,
            inexactLocation: 1,
        });
    });
});
