import type { SpotQualityItem, SpotQualityIssue } from "@/lib/admin/spot-quality";

export const SPOT_GOOGLE_PLACE_ID_MIGRATION_PATH =
    "supabase/migrations/006_spots_google_place_id.sql";

export interface SpotQualitySchemaStatus {
    hasGooglePlaceIdColumn: boolean;
    migrationRequired: boolean;
    migrationPath: string | null;
    blockingAction: string | null;
    blockedOperations: string[];
    commands: {
        applyMigration: string | null;
        verifyColumn: string;
        rerunReadiness: string;
    };
}

function scoreIssue(issue: SpotQualityIssue): number {
    switch (issue) {
        case "missing_real_photo":
            return 100;
        case "inexact_location":
            return 90;
        case "mismatched_place_photo_identity":
            return 85;
        case "missing_place_id":
            return 70;
        case "broad_place_name":
            return 60;
        case "missing_name":
            return 60;
        default:
            return 10;
    }
}

export function getSpotQualityPriority(item: SpotQualityItem): number {
    const issueScore = item.issues.reduce((sum, issue) => sum + scoreIssue(issue), 0);
    const realPhotoBoost = item.photoSummary.hasRealPhoto ? 0 : 20;
    const locationBoost = item.locationConfidence.usableCoordinates ? 0 : 15;
    return issueScore + realPhotoBoost + locationBoost;
}

export function getSpotQualityRecommendedAction(item: SpotQualityItem): string {
    if (item.issues.includes("missing_real_photo") && item.issues.includes("inexact_location")) {
        return "manual_exact_place_research_with_photo_and_coordinates";
    }
    if (item.issues.includes("missing_real_photo")) return "add_reviewed_real_spot_photo";
    if (item.issues.includes("inexact_location")) return "add_exact_address_and_coordinates";
    if (item.issues.includes("mismatched_place_photo_identity")) return "reconcile_place_id_and_place_photo";
    if (item.issues.includes("missing_place_id")) return "save_google_place_id";
    if (item.issues.includes("broad_place_name") || item.issues.includes("missing_name")) {
        return "rename_or_remove_broad_spot";
    }
    return "review";
}

export function buildSpotQualitySchemaStatus(hasGooglePlaceIdColumn: boolean): SpotQualitySchemaStatus {
    return {
        hasGooglePlaceIdColumn,
        migrationRequired: !hasGooglePlaceIdColumn,
        migrationPath: hasGooglePlaceIdColumn ? null : SPOT_GOOGLE_PLACE_ID_MIGRATION_PATH,
        blockingAction: hasGooglePlaceIdColumn
            ? null
            : "apply_google_place_id_migration_before_place_id_writes",
        blockedOperations: hasGooglePlaceIdColumn
            ? []
            : [
                "saving_google_place_id",
                "place_id_backfill_apply",
                "durable_google_maps_directions_by_place_id",
            ],
        commands: {
            applyMigration: hasGooglePlaceIdColumn
                ? null
                : `npx supabase db query --linked --file ${SPOT_GOOGLE_PLACE_ID_MIGRATION_PATH}`,
            verifyColumn:
                "npx tsx scripts/export-spot-quality-action-plan.ts --limit=1 --json",
            rerunReadiness:
                "npm run spots:readiness -- --limit=250 --sample-limit=80",
        },
    };
}
