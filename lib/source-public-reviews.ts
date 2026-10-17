import { NextRequest, NextResponse } from "next/server";

const headers = { "Cache-Control": "no-store" };
const unavailable = () => NextResponse.json({ error: "Reviews unavailable" }, { status: 503, headers });

/** Normal preview has no production database secret. Read only the existing public projection. */
export async function readProductionReviewsForPreview(request: NextRequest, spotId: string): Promise<NextResponse> {
  if (request.method !== "GET" || request.nextUrl.protocol !== "https:"
    || request.nextUrl.hostname !== "localley-next-preview.nkopp.workers.dev"
    || request.nextUrl.searchParams.has("app_data")
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(spotId)) return unavailable();
  const q = request.nextUrl.searchParams;
  const sort = q.get("sort") ?? "recent";
  const limit = q.has("limit") ? Number(q.get("limit")) : 20;
  const offset = q.has("offset") ? Number(q.get("offset")) : 0;
  if (!/^(recent|helpful|highest|lowest)$/.test(sort) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    return NextResponse.json({ error: "Invalid review query" }, { status: 400, headers });
  }
  const url = new URL(`/api/spots/${spotId}/reviews`, "https://www.localley.io");
  url.searchParams.set("sort", sort); url.searchParams.set("limit", String(limit)); url.searchParams.set("offset", String(offset));
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    // Never forward cookies, authorization, candidate flags or version overrides across hosts.
    const response = await fetch(url, { method: "GET", redirect: "error", cache: "no-store", credentials: "omit",
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) { await response.body?.cancel(); return unavailable(); }
    reader = response.body?.getReader(); if (!reader) return unavailable();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > 524288) return unavailable(); chunks.push(value); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(body.reviews) || body.reviews.length > limit || !Number.isSafeInteger(body.total) || body.total < 0
      || !Number.isFinite(body.averageRating) || body.averageRating < 0 || body.averageRating > 5
      || !Array.isArray(body.ratingDistribution) || body.ratingDistribution.length !== 5 || body.ratingDistribution.some((n: unknown) => !Number.isSafeInteger(n) || Number(n) < 0)) return unavailable();
    return NextResponse.json({ reviews: body.reviews, total: body.total, averageRating: body.averageRating,
      ratingDistribution: body.ratingDistribution }, { headers });
  } catch { return unavailable(); }
  finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
}
