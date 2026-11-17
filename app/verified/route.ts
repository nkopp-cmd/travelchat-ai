import { NextResponse, type NextRequest } from "next/server";
import { safeRedirect } from "@/lib/auth/redirect";

// Verify-mail return hop (lib/auth/redirect.ts). Errors never reach here: the middleware sends
// /verified?error=<code> to sign-in first. Success forwards to the page the visitor came from.
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const target = new URL(safeRedirect(request.nextUrl.searchParams.get("to")), request.url);
  return NextResponse.redirect(target, { status: 307, headers: { "Cache-Control": "no-store" } });
}
