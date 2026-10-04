import type { NextRequest } from "next/server";

/** Candidate intent survives missing safety settings; it cannot fall through to source writes. */
export function hasPreviewGuideIntent(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1";
}
