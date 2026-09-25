import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { previewAppDataCounts } from "@/lib/app-data/preview-db";

/** Count-only D1 parity probe for verified preview accounts. Never deployed as a production data path. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (request.nextUrl.hostname !== "localley-next-preview.nkopp.workers.dev"
    || process.env.AUTH_MAIL_MODE !== "outbox"
    || process.env.SUPABASE_READ_ONLY !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const counts = await previewAppDataCounts();
    return NextResponse.json({ source: "D1 pilot only", ...counts }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Preview D1 not ready" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
