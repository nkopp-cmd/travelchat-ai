import { NextRequest, NextResponse } from "next/server";
import { parseFunnelSteps, parseSpotEvents, recordFunnelSteps, recordSpotEvents } from "@/lib/spot-event-store";

// Collector for spot-card events (lib/spot-analytics.ts) and planner funnel steps
// (lib/funnel-analytics.ts), both via sendBeacon. Same-origin only,
// small bodies, bounded batches; always 204 for accepted shapes so the client never retries.
const MAX_BODY_BYTES = 4096;

export async function POST(request: NextRequest) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
    const funnel = (body as { funnel?: unknown })?.funnel !== undefined ? parseFunnelSteps(body) : undefined;
    const rows = funnel === undefined ? parseSpotEvents(body) : null;
    if (!funnel && !rows) return new NextResponse(null, { status: 400 });
    const result = funnel ? await recordFunnelSteps(funnel) : await recordSpotEvents(rows!);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Localley-Events": result } });
}
