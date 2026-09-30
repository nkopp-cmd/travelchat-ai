import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { incrementPreviewChatUsage, isPreviewChatUsageCandidate } from "@/lib/app-data/preview-chat-usage";

export const dynamic = "force-dynamic";

/** No-cost preview proof of the atomic chat counter before paid chat is enabled. */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };
  if (!isPreviewChatUsageCandidate(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const result = await incrementPreviewChatUsage(userId);
    return NextResponse.json(result, { status: result.allowed ? 200 : 429, headers });
  } catch {
    return NextResponse.json({ error: "Preview chat usage unavailable" }, { status: 503, headers });
  }
}
