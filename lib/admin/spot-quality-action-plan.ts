import type { SpotQualityItem, SpotQualityIssue } from "@/lib/admin/spot-quality";

export const SPOT_GOOGLE_PLACE_ID_MIGRATION_PATH =
    "supabase/migrations/006_spots_google_place_id.sql";

export const SPOT_GOOGLE_PLACE_ID_MIGRATION_SQL = [
    "ALTER TABLE spots",
    "ADD COLUMN IF NOT EXISTS google_place_id TEXT;",
    "",
    "CREATE INDEX IF NOT EXISTS idx_spots_google_place_id",
    "ON spots(google_place_id)",
    "WHERE google_place_id IS NOT NULL;",
    "",
    "COMMENT ON COLUMN spots.google_place_id IS 'Durable Google Places place ID used for exact photo provenance and Google Maps directions.';",
].join("\n");

export interface SpotQualityOperatorStatus {
    realImage: "ready" | "needs_real_image" | "needs_image_review" | "needs_place_photo_match";
    location: "exact" | "pinned_needs_address_review" | "needs_exact_address_and_pin";
    directions: "trusted_place_id" | "place_id_needs_location_review" | "search_first" | "blocked_by_place_photo_mismatch";
    publicCard: "ready" | "hidden_until_enriched";
}

export type SpotImageReviewLane =
    | "ready"
    | "exact_place_photo_backfill"
    | "area_image_or_exact_place_split"
    | "event_or_closed_place_review"
    | "photo_identity_review";

export interface SpotImageReviewGuidance {
    lane: SpotImageReviewLane;
    action: string;
    reason: string;
}

export interface SpotQualitySchemaStatus {
    hasGooglePlaceIdColumn: boolean;
    migrationRequired: boolean;
    migrationPath: string | null;
    blockingAction: string | null;
    blockedOperations: string[];
    commands: {
        applyMigration: string | null;
        applyMigrationSql: string | null;
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

const BROAD_AREA_PATTERN = /\b(alley|circle|countryside|district|dong|farms?|hills?|local scene|market street|new town|old town|residential|road|row|scene|street|townhouses?|various areas)\b/i;
const EVENT_OR_STALE_PATTERN = /\b(april|christmas|exhibition|festival|in the making|pop-up|tour)\b/i;

export function getSpotImageReviewGuidance(item: SpotQualityItem): SpotImageReviewGuidance {
    if (item.placePhotoIdentity.hasIdentityMismatch) {
        return {
            lane: "photo_identity_review",
            action: "reconcile_place_id_and_place_photo_before_public_use",
            reason: "The stored Google Place ID and current place-photo source disagree.",
        };
    }

    if (item.photoSummary.hasRealPhoto) {
        return {
            lane: "ready",
            action: "no_image_action_needed",
            reason: "The spot already has a production-safe real image.",
        };
    }

    const searchableText = [item.name, item.address, item.category || ""].join(" ");

    if (EVENT_OR_STALE_PATTERN.test(searchableText)) {
        return {
            lane: "event_or_closed_place_review",
            action: "confirm_event_is_current_or_replace_with_permanent_spot",
            reason: "The spot looks like a dated event, pop-up, tour, or temporary exhibition.",
        };
    }

    if (item.issues.includes("broad_place_name") || BROAD_AREA_PATTERN.test(searchableText)) {
        return {
            lane: "area_image_or_exact_place_split",
            action: "choose_reviewed_area_image_or_split_into_exact_venues",
            reason: "The record reads like a neighborhood, street, or broad area rather than one exact Google Place.",
        };
    }

    return {
        lane: "exact_place_photo_backfill",
        action: "find_exact_google_place_and_add_proxied_place_photos",
        reason: "The spot appears specific enough for exact Google Place photo backfill.",
    };
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

export function getSpotQualityOperatorStatus(item: SpotQualityItem): SpotQualityOperatorStatus {
    const realImage = item.placePhotoIdentity.hasIdentityMismatch
        ? "needs_place_photo_match"
        : item.photoSummary.hasRealPhoto
            ? item.photoReadiness.status === "manual_review"
                ? "needs_image_review"
                : "ready"
            : "needs_real_image";

    const location = item.locationConfidence.exactAddress
        ? "exact"
        : item.locationConfidence.usableCoordinates
            ? "pinned_needs_address_review"
            : "needs_exact_address_and_pin";

    const directions = item.placePhotoIdentity.hasIdentityMismatch
        ? "blocked_by_place_photo_mismatch"
        : item.googlePlaceId && item.locationConfidence.exactAddress
            ? "trusted_place_id"
            : item.googlePlaceId
                ? "place_id_needs_location_review"
                : "search_first";

    return {
        realImage,
        location,
        directions,
        publicCard: item.publicReady ? "ready" : "hidden_until_enriched",
    };
}

export function buildSpotQualityOperatorChecklist(item: SpotQualityItem): string[] {
    const steps: string[] = [];
    const imageGuidance = getSpotImageReviewGuidance(item);

    if (item.issues.includes("missing_name") || item.issues.includes("broad_place_name")) {
        steps.push("Replace broad or missing name with the exact traveler-searchable place name.");
    }

    if (imageGuidance.lane === "event_or_closed_place_review") {
        steps.push("Confirm the event, tour, or pop-up is still current; replace stale records with a permanent spot.");
    }

    if (imageGuidance.lane === "area_image_or_exact_place_split") {
        steps.push("Decide whether this should stay as an area card with a reviewed area image or split into exact venues.");
    }

    if (item.issues.includes("missing_real_photo") || item.issues.includes("inexact_location")) {
        steps.push("Find the exact Google Maps place before changing photos or coordinates.");
    }

    if (item.issues.includes("inexact_location")) {
        steps.push("Save the exact street address and verified coordinates from the matched place.");
    }

    if (item.issues.includes("missing_real_photo")) {
        steps.push("Add a reviewed real spot image, preferably a Localley proxied Google Place photo.");
    }

    if (item.issues.includes("mismatched_place_photo_identity")) {
        steps.push("Make the stored Google Place ID and proxied place-photo source refer to the same place.");
    }

    if (item.issues.includes("missing_place_id")) {
        steps.push("Save the durable Google Place ID that matches the chosen map and image evidence.");
    }

    if (steps.length === 0) {
        steps.push("Review the public card, detail page, and directions preview before marking complete.");
    }

    return steps;
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
            applyMigrationSql: hasGooglePlaceIdColumn
                ? null
                : SPOT_GOOGLE_PLACE_ID_MIGRATION_SQL,
            verifyColumn:
                "npx tsx scripts/export-spot-quality-action-plan.ts --limit=1 --json",
            rerunReadiness:
                "npm run spots:readiness -- --limit=250 --sample-limit=80",
        },
    };
}
