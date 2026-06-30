import type { MultiLanguageField } from "@/types";

type PublicSpotTextField = MultiLanguageField | string | null | undefined;

export interface PublicSpotQualityInput {
    name: PublicSpotTextField;
    photos?: string[] | null;
}

export const PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS = [
    "%Residential%",
    "%Office District%",
    "%Working District%",
    "%Station Area%",
    "% Local",
    "%Walking Route%",
    "%Day Trip%",
    "%Bar Crawl%",
    "%Market Crawl%",
    "%Various%",
    "%Multiple%",
] as const;

const PUBLIC_BROAD_SPOT_NAME_PATTERN =
    /\b(?:residential(?:\s+area)?|(?:office|working)\s+district|station\s+area|walking\s+route|day\s+trip|bar\s+crawl|market\s+crawl|various|multiple)\b|\blocal$/i;

type PublicSpotFilterBuilder<TQuery> = {
    not: (column: string, operator: string, value: string | null) => TQuery;
};

function getPublicSpotText(field: PublicSpotTextField): string {
    if (!field) return "";

    if (typeof field === "object") {
        return field.en || Object.values(field)[0] || "";
    }

    return field;
}

export function getPublicSpotQualityIssue(
    spot: PublicSpotQualityInput
): string | null {
    const name = getPublicSpotText(spot.name).trim();

    if (!name) return "missing_name";
    if (PUBLIC_BROAD_SPOT_NAME_PATTERN.test(name)) return "broad_place_name";
    if ("photos" in spot && !spot.photos?.length) return "missing_real_photo";

    return null;
}

export function shouldShowPublicSpot(spot: PublicSpotQualityInput): boolean {
    return getPublicSpotQualityIssue(spot) === null;
}

export function applyPublicSpotVisibilityFilters<
    TQuery extends PublicSpotFilterBuilder<TQuery>,
>(
    query: TQuery
): TQuery {
    let currentQuery = query;

    for (const pattern of PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS) {
        currentQuery = currentQuery.not("name->>en", "ilike", pattern);
    }

    return currentQuery
        .not("photos", "is", null)
        .not("photos", "eq", "{}");
}
