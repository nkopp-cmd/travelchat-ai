import { NextRequest, NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { refreshApifySpotDiscovery } from "@/lib/apify-spot-discovery";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await refreshApifySpotDiscovery();
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error(
      "[apify-spot-discovery] Refresh failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { success: false, error: "Apify spot discovery could not be refreshed." },
      { status: 500 },
    );
  }
}
