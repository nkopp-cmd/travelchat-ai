import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { Errors } from "@/lib/api-errors";

/** Explicit candidate intent must never reach source billing, even when safety vars are missing. */
export async function previewBillingActionRefusal(request: NextRequest): Promise<NextResponse | null> {
  if (request.nextUrl.hostname !== "localley-next-preview.nkopp.workers.dev"
    || request.nextUrl.searchParams.get("data_candidate") !== "d1") return null;
  const { userId } = await auth();
  if (!userId) return Errors.unauthorized();
  return NextResponse.json({ error: {
    code: "feature_disabled", message: "Billing changes are unavailable in this preview.",
  } }, { status: 503, headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" } });
}
