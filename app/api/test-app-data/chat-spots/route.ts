import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { isPreviewChatUsageCandidate } from "@/lib/app-data/preview-chat-usage";
import { previewChatSpotContext } from "@/lib/app-data/preview-chat-spots";

export const dynamic = "force-dynamic";

/** No-cost preview proof for the archived chat prompt context. */
export async function GET(request: NextRequest) {
  if (!isPreviewChatUsageCandidate(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const city = request.nextUrl.searchParams.get("city") ?? "";
  const question = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const result = await previewChatSpotContext(city, question);
    return NextResponse.json({ city: result.city, spotIds: result.spotIds,
      categories: result.categories,
      contextSha256: createHash("sha256").update(result.context).digest("hex") }, {
      headers: { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" },
    });
  } catch (error) {
    const status = error instanceof RangeError ? 400 : 503;
    return NextResponse.json({ error: status === 400 ? "Invalid chat spot query" : "Chat spots unavailable" }, {
      status, headers: { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" },
    });
  }
}
