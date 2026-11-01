import { NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/lib/app-data/backend";
import { HELP_COUNTRY_CODES, NEARBY_LIMIT, NEARBY_RADIUS_KM, boundingBox, distanceMeters, mapLinks, parseNearbyPoint, type NearbyResponse, type NearbySpot } from "@/lib/help/open-nearby";
import { helpCountry } from "@/lib/help/phrases";
import { rateLimit, strictPlatformLimit } from "@/lib/rate-limit";
import { parseSpotCoordinates } from "@/lib/spots/coordinates";
import { d1SpotsInBox } from "@/lib/spots/d1-queries";
import { shouldShowPublicSpot } from "@/lib/spots/public-quality";
import { getLocalizedText } from "@/lib/spots/transform";

export const dynamic = "force-dynamic";
const developmentLimit = rateLimit({ windowMs: 60_000, maxRequests: 20 });
// The answer depends on the visitor's position: only their browser may keep it, and only briefly.
const headers = { "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" };
const unavailable = (status: number) =>
  NextResponse.json({ status: "unavailable", spots: [] } satisfies NearbyResponse, { status, headers: { ...headers, "Cache-Control": "no-store" } });

/** Nearby public spots by our stored coordinates (helper 5). No Places call: hours are one tap away in the map apps. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const country = helpCountry(params.get("country") ?? "");
  const point = parseNearbyPoint(params.get("lat"), params.get("lng"));
  if (!country || !point) return unavailable(400);
  if (process.env.NODE_ENV === "production") {
    const verdict = await strictPlatformLimit(req, 20, "help_open_nearby");
    if (verdict === "unavailable") return unavailable(503);
    if (verdict === "limited") return unavailable(429);
  } else {
    const limited = await developmentLimit(req);
    if (limited) return unavailable(429);
  }
  if (dataBackend() !== "d1") return unavailable(503);
  let rows;
  try {
    rows = await d1SpotsInBox(boundingBox(point), 300);
  } catch {
    console.error("[help-open] source_unavailable");
    return unavailable(503);
  }
  const countryCode = HELP_COUNTRY_CODES[country.slug];
  const spots: NearbySpot[] = rows.flatMap((spot) => {
    const at = parseSpotCoordinates(spot.location);
    if (!at || !shouldShowPublicSpot({ name: spot.name, address: spot.address, location: spot.location, photos: spot.photos, google_place_id: spot.google_place_id })) return [];
    const name = getLocalizedText(spot.name);
    const local = typeof spot.name === "object" && spot.name ? (spot.name as Record<string, string | undefined>)[country.language] : undefined;
    const localName = local && local !== name ? local : null;
    return [{ id: spot.id, name, localName, category: spot.category ?? null, distanceM: distanceMeters(point, at),
      ...mapLinks({ name, localName, lat: at.lat, lng: at.lng, googlePlaceId: spot.google_place_id ?? null }, countryCode) }];
  }).filter((spot) => spot.distanceM <= NEARBY_RADIUS_KM * 1000).sort((a, b) => a.distanceM - b.distanceM).slice(0, NEARBY_LIMIT);
  return NextResponse.json({ status: "ok", spots } satisfies NearbyResponse, { headers });
}
