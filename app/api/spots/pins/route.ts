import { NextResponse, type NextRequest } from "next/server";
import { fetchPinIndex, parseFilterParams } from "@/lib/spots/queries";

// Map pin index for the active /spots filter (shared/plans/localley-full-map.md item 1): every visible spot
// with coordinates, compact columnar JSON. Public catalog data; the edge caches the unfiltered and
// enabled-city variants (cloudflare/opennext/edge-html-cache.ts), browsers keep it with stale-while-revalidate.
export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams;
    const filters = parseFilterParams({
        city: query.get("city") ?? undefined,
        category: query.get("category") ?? undefined,
        score: query.get("score") ?? undefined,
        search: query.get("search")?.slice(0, 40) ?? undefined,
    });
    try {
        const index = await fetchPinIndex(filters);
        return NextResponse.json(index, {
            headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400" },
        });
    } catch {
        return NextResponse.json({ error: "Spot pins could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}
