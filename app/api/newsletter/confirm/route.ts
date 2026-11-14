import { NextRequest, NextResponse } from "next/server";
import { confirm, newsletterDb } from "@/lib/newsletter/store";

// POST only: the mail link opens /newsletter/confirm (a page with one button), so mail scanners that follow links
// cannot confirm an address.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let token: unknown = null;
  try {
    token = (await req.formData()).get("token");
  } catch { /* invalid below */ }
  const db = newsletterDb();
  let ok = false;
  try {
    ok = Boolean(db) && await confirm(db!, token);
  } catch {
    console.error("[newsletter] store_unavailable");
  }
  return NextResponse.redirect(new URL(`/newsletter/${ok ? "confirmed" : "invalid"}`, req.url),
    { status: 303, headers: { "Cache-Control": "no-store" } });
}
