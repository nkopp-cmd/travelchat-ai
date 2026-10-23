import { NextResponse } from "next/server";
import { WEEKEND_PICK_SLUGS } from "@/components/landing/weekend-picks-data";
import { pickConditions } from "@/lib/weather/pick-conditions";

// One public, cacheable request for the landing Weekend picks chips. A fixed city list (no
// query input), so it cannot be used to fan out upstream calls.
export async function GET() {
    const cities = await pickConditions(WEEKEND_PICK_SLUGS);
    return NextResponse.json({ cities }, {
        headers: { "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600" },
    });
}
