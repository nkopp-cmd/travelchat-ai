import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase";
import { isPlanningSpotId, type PlanningSpot } from "@/lib/itineraries/spot-planning";
import { shouldShowPublicSpot } from "@/lib/spots/public-quality";
import { parseSpotCoordinates } from "@/lib/spots/coordinates";
import { inferSpotContextCity } from "@/lib/spots/city-context";

function localizedText(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    const row = value as Record<string, unknown>;
    return localizedText(row.en || Object.values(row).find((entry) => typeof entry === "string" && entry.trim()));
}

function allLocalizedText(value: unknown): string {
    return value && typeof value === "object"
        ? Object.values(value).filter((entry) => typeof entry === "string").join(" ")
        : localizedText(value);
}

export async function getPlanningSpot(spotId: string): Promise<PlanningSpot | null> {
    if (!isPlanningSpotId(spotId)) return null;
    const { data: spot, error } = await createSupabaseAdmin().from("spots").select("*").eq("id", spotId).maybeSingle();
    if (error) throw error;
    if (!spot || !shouldShowPublicSpot(spot)) return null;
    const coordinates = parseSpotCoordinates(spot.location);
    const city = inferSpotContextCity({
        name: allLocalizedText(spot.name),
        address: allLocalizedText(spot.address),
        lat: coordinates?.lat,
        lng: coordinates?.lng,
    });
    if (!city) return null;
    return {
        id: spot.id,
        name: localizedText(spot.name),
        city,
        address: localizedText(spot.address),
        description: localizedText(spot.description),
        category: localizedText(spot.category),
        ...(coordinates ? { latitude: coordinates.lat, longitude: coordinates.lng } : {}),
    };
}
