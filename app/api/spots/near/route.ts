import { NextRequest, NextResponse } from "next/server";
import { dataBackend } from "@/lib/app-data/backend";
import { boundingBox, distanceMeters, parseNearbyPoint } from "@/lib/help/open-nearby";
import { rateLimit, strictPlatformLimit } from "@/lib/rate-limit";
import { parseSpotCoordinates } from "@/lib/spots/coordinates";
import { d1SpotsInBox } from "@/lib/spots/d1-queries";
import { shouldShowPublicSpot } from "@/lib/spots/public-quality";
import { transformSpot } from "@/lib/spots/transform";
import { NEAR_LIMIT, NEAR_RADIUS_KM, type NearSpotsResponse } from "@/lib/spots/near";

// "My location" on the /spots map (shared/plans/localley-mobile-map-ux-asia-growth.md item 2): the nearest public
// spots as full cards for the "Near you" sheet, in one request. Same data and limits as helper 5 (/api/help/open).
export const dynamic = "force-dynamic";

const developmentLimit = rateLimit({ windowMs: 60_000, maxRequests: 20 });
// The answer depends on the visitor's position: only their browser may keep it, and only briefly.
const headers = { "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" };
const unavailable = (status: number) =>
    NextResponse.json({ status: "unavailable", spots: [] } satisfies NearSpotsResponse, { status, headers: { ...headers, "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
    const params = req.nextUrl.searchParams;
    // Rounded to ~110 m: the query never needs the exact position.
    const point = parseNearbyPoint(params.get("lat"), params.get("lng"));
    if (!point) return unavailable(400);
    if (process.env.NODE_ENV === "production") {
        const verdict = await strictPlatformLimit(req, 20, "spots_near");
        if (verdict === "unavailable") return unavailable(503);
        if (verdict === "limited") return unavailable(429);
    } else if (await developmentLimit(req)) {
        return unavailable(429);
    }
    if (dataBackend() !== "d1") return unavailable(503);
    let rows;
    try {
        rows = await d1SpotsInBox(boundingBox(point, NEAR_RADIUS_KM), 400);
    } catch {
        console.error("[spots-near] source_unavailable");
        return unavailable(503);
    }
    const spots = rows.flatMap((row) => {
        const at = parseSpotCoordinates(row.location);
        if (!at || !shouldShowPublicSpot({ name: row.name, address: row.address, location: row.location, photos: row.photos, google_place_id: row.google_place_id })) return [];
        const distanceM = distanceMeters(point, at);
        return distanceM <= NEAR_RADIUS_KM * 1000 ? [{ row, distanceM }] : [];
    }).sort((a, b) => a.distanceM - b.distanceM).slice(0, NEAR_LIMIT)
        .map(({ row, distanceM }) => ({ ...transformSpot(row), distanceM }));
    return NextResponse.json({ status: "ok", spots } satisfies NearSpotsResponse, { headers });
}
