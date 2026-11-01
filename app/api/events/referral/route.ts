import { NextRequest, NextResponse } from "next/server";
import { strictPlatformLimit } from "@/lib/rate-limit";
import { referralPoint } from "@/lib/referral-point";

// Collector for the landing beacon in app/layout.tsx (lib/referral-point.ts).
// Same-origin only, tiny bodies, 5 points per IP per minute; always 204 so the client never retries.
const MAX_BODY_BYTES = 1024;

interface AnalyticsDataset { writeDataPoint(point: { blobs?: string[]; indexes?: string[] }): void }

function dataset(): AnalyticsDataset | undefined {
    const context = (globalThis as Record<symbol, { env?: { REFERRALS?: AnalyticsDataset } } | undefined>)
        [Symbol.for("__cloudflare-context__")];
    return context?.env?.REFERRALS;
}

export async function POST(request: NextRequest) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
    const point = referralPoint(body);
    if (!point) return new NextResponse(null, { status: 400 });
    let result = "skipped";
    const target = dataset();
    if (target && (await strictPlatformLimit(request, 5, "referral")) !== "limited") {
        try { target.writeDataPoint(point); result = "written"; } catch { result = "failed"; }
    }
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Localley-Referral": result } });
}
