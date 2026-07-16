import { NextRequest, NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { refreshWeeklySocialTrends } from "@/lib/weekly-social-trends";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await refreshWeeklySocialTrends();
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error(
      "[weekly-social-trends] Refresh failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { success: false, error: "Weekly social trends could not be refreshed." },
      { status: 500 },
    );
  }
}
