import { NextRequest, NextResponse } from "next/server";
import { parseSpotEvents, recordSpotEvents } from "@/lib/spot-event-store";

// Collector for spot-card events (sendBeacon from lib/spot-analytics.ts). Same-origin only,
// small bodies, bounded batches; always 204 for accepted shapes so the client never retries.
const MAX_BODY_BYTES = 4096;

export async function POST(request: NextRequest) {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
    const rows = parseSpotEvents(body);
    if (!rows) return new NextResponse(null, { status: 400 });
    const result = await recordSpotEvents(rows);
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Localley-Events": result } });
}
