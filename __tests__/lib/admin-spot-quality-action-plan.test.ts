import { describe, expect, it } from "vitest";
import {
    buildSpotQualityOperatorChecklist,
    buildSpotQualitySchemaStatus,
    getSpotQualityOperatorStatus,
    getSpotQualityPriority,
    getSpotQualityRecommendedAction,
    SPOT_GOOGLE_PLACE_ID_MIGRATION_PATH,
} from "@/lib/admin/spot-quality-action-plan";
import { toSpotQualityItem, type SpotQualityRow } from "@/lib/admin/spot-quality";

function createRow(overrides: Partial<SpotQualityRow> = {}): SpotQualityRow {
    return {
        id: "spot_1",
        name: { en: "Cafe Ladrio" },
        address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
        description: { en: "Quiet kissaten with a real address." },
        photos: ["https://example.com/ladrio.jpg"],
        category: "Cafe",
        location: "POINT(139.7580000 35.6950000)",
        google_place_id: null,
        created_at: "2026-06-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("spot quality action plan", () => {
    it("reports the Google Place ID migration as a blocking schema action", () => {
        expect(buildSpotQualitySchemaStatus(false)).toEqual({
            hasGooglePlaceIdColumn: false,
            migrationRequired: true,
            migrationPath: SPOT_GOOGLE_PLACE_ID_MIGRATION_PATH,
            blockingAction: "apply_google_place_id_migration_before_place_id_writes",
            blockedOperations: [
                "saving_google_place_id",
                "place_id_backfill_apply",
                "durable_google_maps_directions_by_place_id",
            ],
            commands: {
                applyMigration: `npx supabase db query --linked --file ${SPOT_GOOGLE_PLACE_ID_MIGRATION_PATH}`,
                verifyColumn: "npx tsx scripts/export-spot-quality-action-plan.ts --limit=1 --json",
                rerunReadiness: "npm run spots:readiness -- --limit=250 --sample-limit=80",
            },
        });
    });

    it("keeps spot-level actions separate from schema readiness", () => {
        const missingPhotoAndLocation = toSpotQualityItem(
            createRow({
                address: { en: "Tokyo" },
                photos: ["/images/placeholders/default.svg"],
                location: "POINT(0 0)",
            }),
            false
        );
        const missingPlaceId = toSpotQualityItem(createRow(), true);

        expect(getSpotQualityRecommendedAction(missingPhotoAndLocation)).toBe(
            "manual_exact_place_research_with_photo_and_coordinates"
        );
        expect(getSpotQualityRecommendedAction(missingPlaceId)).toBe("save_google_place_id");
        expect(getSpotQualityPriority(missingPhotoAndLocation)).toBeGreaterThan(
            getSpotQualityPriority(missingPlaceId)
        );
    });

    it("builds operator statuses and checklists for exact place cleanup", () => {
        const needsExactPlace = toSpotQualityItem(
            createRow({
                address: { en: "Tokyo" },
                photos: ["/images/placeholders/default.svg"],
                location: "POINT(0 0)",
            }),
            true
        );
        const trustedPlace = toSpotQualityItem(
            createRow({
                photos: ["/api/places/photo?name=places/ChIJ-ladrio/photos/photo_1&w=1200"],
                google_place_id: "ChIJ-ladrio",
            }),
            true
        );

        expect(getSpotQualityOperatorStatus(needsExactPlace)).toEqual({
            realImage: "needs_real_image",
            location: "needs_exact_address_and_pin",
            directions: "search_first",
            publicCard: "hidden_until_enriched",
        });
        expect(buildSpotQualityOperatorChecklist(needsExactPlace)).toEqual([
            "Find the exact Google Maps place before changing photos or coordinates.",
            "Save the exact street address and verified coordinates from the matched place.",
            "Add a reviewed real spot image, preferably a Localley proxied Google Place photo.",
        ]);
        expect(getSpotQualityOperatorStatus(trustedPlace)).toEqual({
            realImage: "ready",
            location: "exact",
            directions: "trusted_place_id",
            publicCard: "ready",
        });
    });

    it("blocks direction trust when place photos and stored place ID disagree", () => {
        const mismatch = toSpotQualityItem(
            createRow({
                photos: ["/api/places/photo?name=places/ChIJ-photo/photos/photo_1&w=1200"],
                google_place_id: "ChIJ-stored",
            }),
            true
        );

        expect(getSpotQualityOperatorStatus(mismatch)).toMatchObject({
            realImage: "needs_place_photo_match",
            directions: "blocked_by_place_photo_mismatch",
            publicCard: "hidden_until_enriched",
        });
        expect(buildSpotQualityOperatorChecklist(mismatch)).toContain(
            "Make the stored Google Place ID and proxied place-photo source refer to the same place."
        );
    });
});
