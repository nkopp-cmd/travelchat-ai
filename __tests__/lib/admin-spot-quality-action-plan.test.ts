import { describe, expect, it } from "vitest";
import {
    buildSpotQualitySchemaStatus,
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
});
