import { NextRequest, NextResponse } from "next/server";
import { newsletterDb, unsubscribe } from "@/lib/newsletter/store";

// Two callers: the button on /newsletter/unsubscribe (form field "token"), and mail clients that use RFC 8058
// one-click (POST <List-Unsubscribe URL>?token=... with body "List-Unsubscribe=One-Click").
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let token: unknown = req.nextUrl.searchParams.get("token");
  let oneClick = false;
  try {
    const form = await req.formData();
    oneClick = form.get("List-Unsubscribe") === "One-Click";
    token = form.get("token") ?? token;
  } catch { /* query token only */ }
  const db = newsletterDb();
  let ok = false;
  try {
    ok = Boolean(db) && await unsubscribe(db!, token);
  } catch {
    console.error("[newsletter] store_unavailable");
    return new NextResponse("Unavailable, please try again.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (oneClick) {
    return new NextResponse(ok ? "Unsubscribed." : "Unknown link.", { status: ok ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(new URL(`/newsletter/${ok ? "unsubscribed" : "invalid"}`, req.url),
    { status: 303, headers: { "Cache-Control": "no-store" } });
}
