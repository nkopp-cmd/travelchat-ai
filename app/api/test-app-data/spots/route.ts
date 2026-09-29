import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { previewSpotPage } from "@/lib/app-data/preview-db";

export const dynamic = "force-dynamic";

/** Candidate-only catalog probe. The normal spots page still uses Supabase. */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (request.nextUrl.hostname !== "localley-next-preview.nkopp.workers.dev"
    || process.env.AUTH_MAIL_MODE !== "outbox"
    || process.env.SUPABASE_READ_ONLY !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const limit = request.nextUrl.searchParams.get("limit") ?? "8";
  const offset = request.nextUrl.searchParams.get("offset") ?? "0";
  if (!/^(?:[1-9]|1\d|2[0-4])$/.test(limit) || !/^(?:0|[1-9]\d{0,3})$/.test(offset) || Number(offset) > 1000) {
    return NextResponse.json({ error: "Invalid pagination" }, { status: 400, headers });
  }
  try {
    const page = await previewSpotPage(Number(limit), Number(offset));
    return NextResponse.json({ source: "D1 pilot only", ...page }, { headers });
  } catch {
    return NextResponse.json({ error: "Preview D1 not ready" }, { status: 503, headers });
  }
}
