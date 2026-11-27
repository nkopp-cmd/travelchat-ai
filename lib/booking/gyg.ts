import { isFreeStop } from "@/lib/booking/match";

/**
 * Push DR1 / booking plan B7: one GetYourGuide search link for a paid-entry landmark spot.
 * It needs no partner API call, so it renders in the cached HTML for every visitor
 * (the Viator card needs a session and a matched product).
 */

/** Spot category words where a name search on GetYourGuide finds tickets or tours for that place. */
const GYG_CATEGORY_WORDS = [
    "temple", "palace", "shrine", "museum", "gallery", "attraction", "landmark", "tower", "observatory",
    "theme park", "amusement", "zoo", "aquarium", "castle", "fortress", "class", "workshop", "activity", "market",
];

const PLACEHOLDER_IDS = new Set(["localley", "placeholder", "changeme", "test"]);

/** The real GetYourGuide partner id from the Worker env, or null (no link without it). */
export function gygPartnerId(env: Record<string, string | undefined> = process.env): string | null {
    const value = (env.GETYOURGUIDE_PARTNER_ID ?? "").trim();
    if (!/^[A-Za-z0-9]{3,32}$/.test(value) || PLACEHOLDER_IDS.has(value.toLowerCase())) return null;
    return value;
}

export function isGygSpotCategory(category?: string | null): boolean {
    const text = (category ?? "").toLowerCase();
    return GYG_CATEGORY_WORDS.some((word) => text.includes(word));
}

/** Search URL for one spot, or null when the spot is free, not a landmark type, or no partner id exists. */
export function gygSpotSearchUrl(
    spot: { name?: string | null; category?: string | null; city?: string | null },
    partnerId: string | null,
): string | null {
    const name = spot.name?.trim();
    const city = spot.city?.trim();
    if (!partnerId || !name || !city) return null;
    if (!isGygSpotCategory(spot.category)) return null;
    if (isFreeStop({ name, category: spot.category?.toLowerCase() })) return null;
    const params = new URLSearchParams({ q: `${name} ${city}`, partner_id: partnerId, cmp: "localley-spot" });
    return `https://www.getyourguide.com/s/?${params.toString()}`;
}
