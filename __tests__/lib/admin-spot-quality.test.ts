import { describe, expect, it } from "vitest";
import {
    buildSpotQualityQueueFromItems,
    buildSpotQualityPatchPayload,
    getSpotPhotoReadiness,
    summarizeSpotQualityItems,
    toSpotQualityItem,
    type SpotQualityRow,
} from "@/lib/admin/spot-quality";
import { summarizeSpotPhotos } from "@/lib/place-images";

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
        expect(item.placePhotoIdentity.ready).toBe(false);
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
        expect(item.photoReadiness.status).toBe("place_ready");
        expect(item.photoReadiness.canAutoBackfill).toBe(true);
        expect(item.placePhotoIdentity.hasGooglePlacePhoto).toBe(false);
    });

    it("marks proxied photos ready only when the stored Place ID matches", () => {
        const item = toSpotQualityItem(
            createRow({
                address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
                location: "POINT(139.7580000 35.6950000)",
                photos: ["/api/places/photo?name=places/ChIJ-test-place/photos/photo_1&w=1200"],
                google_place_id: "ChIJ-test-place",
            }),
            true
        );

        expect(item.photoSummary.hasGooglePlacePhoto).toBe(true);
        expect(item.placePhotoIdentity).toMatchObject({
            photoPlaceIds: ["ChIJ-test-place"],
            storedPlaceId: "ChIJ-test-place",
            hasOwnPlacePhoto: true,
            hasIdentityMismatch: false,
            ready: true,
        });
    });

    it("flags mismatched proxied place photos for manual review", () => {
        const item = toSpotQualityItem(
            createRow({
                address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
                location: "POINT(139.7580000 35.6950000)",
                photos: ["/api/places/photo?name=places/ChIJ-photo-place/photos/photo_1&w=1200"],
                google_place_id: "ChIJ-stored-other",
            }),
            true
        );

        expect(item.publicReady).toBe(false);
        expect(item.publicQualityIssue).toBe("mismatched_place_photo_identity");
        expect(item.issues).toEqual(["mismatched_place_photo_identity"]);
        expect(item.photoReadiness).toMatchObject({
            status: "manual_review",
            label: "Place photo mismatch",
            tone: "danger",
            canAutoBackfill: true,
        });
        expect(item.placePhotoIdentity.hasIdentityMismatch).toBe(true);
    });

    it("summarizes photo readiness for safe operator backfill decisions", () => {
        expect(
            getSpotPhotoReadiness(
                summarizeSpotPhotos(["/api/places/photo?name=places/abc/photos/photo_1&w=1200"]),
                "abc",
                true
            )
        ).toMatchObject({
            status: "ready",
            tone: "good",
            canAutoBackfill: false,
        });

        expect(
            getSpotPhotoReadiness(
                summarizeSpotPhotos(["/images/placeholders/default.svg"]),
                null,
                true
            )
        ).toMatchObject({
            status: "backfill_ready",
            tone: "danger",
            canAutoBackfill: true,
        });
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
            mismatchedPlacePhotoIdentity: 0,
        });
    });

    it("keeps full, filtered, and visible queue summaries separate", () => {
        const items = [
            toSpotQualityItem(createRow({ id: "spot_1", created_at: "2026-06-01T00:00:00.000Z" }), true),
            toSpotQualityItem(
                createRow({
                    id: "spot_2",
                    address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
                    location: "POINT(139.7580000 35.6950000)",
                    photos: ["https://example.com/ladrio.jpg"],
                    google_place_id: "ChIJ-test-place",
                    created_at: "2026-06-02T00:00:00.000Z",
                }),
                true
            ),
            toSpotQualityItem(
                createRow({
                    id: "spot_3",
                    name: { en: "Cafe Ladrio" },
                    address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
                    location: "POINT(139.7580000 35.6950000)",
                    photos: ["https://example.com/ladrio.jpg"],
                    google_place_id: "ChIJ-ready-place",
                    created_at: "2026-06-03T00:00:00.000Z",
                }),
                true
            ),
        ];

        const queue = buildSpotQualityQueueFromItems({
            items,
            hasGooglePlaceIdColumn: true,
            city: "Tokyo",
            issue: "missing_real_photo",
            limit: 1,
            generatedAt: "2026-07-01T00:00:00.000Z",
        });

        expect(queue.summary).toMatchObject({
            total: 3,
            publicReady: 2,
            needsWork: 1,
            missingRealPhoto: 1,
        });
        expect(queue.filteredSummary).toMatchObject({
            total: 1,
            missingRealPhoto: 1,
        });
        expect(queue.visibleSummary).toMatchObject({
            total: 1,
            missingRealPhoto: 1,
        });
        expect(queue.items.map((item) => item.id)).toEqual(["spot_1"]);
    });
});
