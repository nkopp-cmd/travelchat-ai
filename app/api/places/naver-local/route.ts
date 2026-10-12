import { NextRequest, NextResponse } from "next/server";
import { strictPlatformLimit } from "@/lib/rate-limit";
import { localQuery, referenceRuntime, ReferenceUnavailable, searchLocalReferences } from "@/lib/naver/local-search";

/** Public reference lookup, with provider quota independent from all application data. */
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  const city = req.nextUrl.searchParams.get("city") ?? "", name = req.nextUrl.searchParams.get("name") ?? "";
  try { localQuery(city, name); } catch { return NextResponse.json({ error: "invalid_query" }, { status: 400, headers }); }
  const limit = await strictPlatformLimit(req, 10, "naver-local");
  if (limit !== "ok") return NextResponse.json({ error: limit === "limited" ? "rate_limited" : "unavailable" },
    { status: limit === "limited" ? 429 : 503, headers });
  try {
    const result = await searchLocalReferences({ ...referenceRuntime(), city, name });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const reason = error instanceof ReferenceUnavailable ? error.reason : "unavailable";
    return NextResponse.json({ error: reason }, { status: reason === "daily_limit" ? 429 : 503, headers });
  }
}
