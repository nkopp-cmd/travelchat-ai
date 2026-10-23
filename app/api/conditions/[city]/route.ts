import { NextResponse } from "next/server";
import { cityOutlook } from "@/lib/weather/trip-outlook";

// Planner trip outlook for one city: season table + MET 7-day forecast. Only the reviewed
// season-table cities answer (404 otherwise), and MET reads go through the shared grid cache.
export async function GET(_request: Request, { params }: { params: Promise<{ city: string }> }) {
    const { city } = await params;
    const outlook = await cityOutlook(decodeURIComponent(city).slice(0, 60));
    if (!outlook) return NextResponse.json({ error: "Unknown city" }, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
    return NextResponse.json(outlook, {
        headers: { "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600" },
    });
}
