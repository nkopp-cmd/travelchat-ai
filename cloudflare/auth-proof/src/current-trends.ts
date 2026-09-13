import { nativeTrendPayloadSchema, currentUtcWeek } from "../../../lib/native-trend-contract";
import review from "../pilot/channel-trends.json";
import { appError } from "./app-error";

export async function currentTrends(request: Request, env: Env, now = Date.now()) {
  const url = new URL(request.url), city = url.searchParams.get("city") || "tokyo";
  if ([...url.searchParams.keys()].some(key => key !== "city") || url.searchParams.getAll("city").length > 1 || city !== "tokyo") {
    return appError("validation_error", "Only the reviewed Tokyo sample is available", 400);
  }
  const weekStart = currentUtcWeek(now), serverNow = new Date(now).toISOString();
  const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });
  const row = await env.DB.prepare(`SELECT week_start,observed_at,expires_at,review_id,
    CASE WHEN length(CAST(payload AS BLOB)) <= 65536 THEN payload ELSE NULL END AS payload
    FROM native_current_trends WHERE city_slug=?`).bind(city).first<{
      week_start: string; observed_at: number; expires_at: number; review_id: string; payload: string | null;
    }>();
  if (!row || row.week_start !== weekStart || row.expires_at <= now || now >= Date.parse(review.validUntil)) {
    return json({ status: "unready", citySlug: city, weekStart, serverNow, rankings: [], reason: "No fresh reviewed snapshot is available." });
  }
  const payload = row.payload && nativeTrendPayloadSchema.safeParse(JSON.parse(row.payload));
  if (!payload || !payload.success) return appError("invalid_trend_snapshot", "The reviewed snapshot is unavailable", 503);
  const data = payload.data;
  const invalid = row.review_id !== review.reviewId || data.reviewId !== review.reviewId || data.citySlug !== city
    || data.weekStart !== weekStart || Date.parse(data.observedAt) !== row.observed_at || Date.parse(data.expiresAt) !== row.expires_at
    || row.observed_at > now || row.expires_at - row.observed_at > 86400000 || row.expires_at <= row.observed_at
    || row.expires_at > Date.parse(review.validUntil) || currentUtcWeek(row.observed_at) !== weekStart
    || data.rankings.length !== 1 || data.coverage !== review.coverage || data.sourceEntries !== data.excludedEntries + data.unreviewedEntries + 1
    || data.rankings.some(rank => rank.rank !== 1 || rank.spotId !== review.spotId || rank.name !== review.venueName
      || rank.address !== review.venueAddress || rank.lat !== review.latitude || rank.lng !== review.longitude
      || rank.venueUrl !== `https://localley.io/spots/${review.spotId}` || rank.summary !== review.displaySummary
      || rank.source.channelId !== review.channelId || rank.source.ownerUrl !== review.ownerUrl
      || rank.source.label !== review.channelLabel || rank.source.videoId !== review.videoId
      || rank.source.feedUrl !== `https://www.youtube.com/feeds/videos.xml?channel_id=${review.channelId}`
      || rank.source.url !== `https://www.youtube.com/watch?v=${review.videoId}` || rank.source.publishedAt !== review.publishedAt
      || Date.parse(rank.source.publishedAt) > row.observed_at || currentUtcWeek(Date.parse(rank.source.publishedAt)) !== weekStart
      || rank.source.metrics.views === null || [rank.source.metrics.likes, rank.source.metrics.comments, rank.source.metrics.shares, rank.source.metrics.saves].some(value => value !== null));
  if (invalid) return appError("invalid_trend_snapshot", "The reviewed snapshot is unavailable", 503);
  return json({ status: "ready", serverNow, ...data });
}
