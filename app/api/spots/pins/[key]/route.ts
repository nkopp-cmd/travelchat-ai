import { NextResponse } from "next/server";
import { fetchPinCard } from "@/lib/spots/queries";
import { PIN_KEY_PATTERN } from "@/lib/spots/pin-index";

// Card data for one map pin, fetched on tap (the pin index carries no names or photos).
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
    const { key } = await params;
    if (!PIN_KEY_PATTERN.test(key)) {
        return NextResponse.json({ error: "Unknown pin." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const spot = await fetchPinCard(key).catch(() => undefined);
    if (spot === undefined) {
        return NextResponse.json({ error: "Spot could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (!spot) {
        return NextResponse.json({ error: "Unknown pin." }, { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
    }
    return NextResponse.json({ spot }, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400" },
    });
}
