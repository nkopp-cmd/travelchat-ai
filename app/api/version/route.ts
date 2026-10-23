import { NextResponse } from "next/server";

// Release proof for the Gravity release lane: the commit this Worker version was built from
// (BUILD_SHA, set by scripts/release/production.mjs at upload). Public; carries no other data.
export const dynamic = "force-dynamic";

export function GET() {
    return NextResponse.json({ sha: process.env.BUILD_SHA ?? null }, { headers: { "Cache-Control": "no-store" } });
}
