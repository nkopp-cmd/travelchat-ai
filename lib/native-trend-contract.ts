import * as z from "zod/mini";

const text = (maximum: number) => z.string().check(z.minLength(1), z.maxLength(maximum));
const integer = (minimum: number, maximum: number) => z.int().check(z.gte(minimum), z.lte(maximum));
const count = z.nullable(integer(0, Number.MAX_SAFE_INTEGER));
const httpsUrl = z.url().check(z.maxLength(2048), z.refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash;
}));
export const nativeTrendPayloadSchema = z.strictObject({
  version: z.literal("localley-visible-trends-v1"), reviewId: text(100), citySlug: z.literal("tokyo"),
  weekStart: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/)), observedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  sourceEntries: integer(1, 20), excludedEntries: integer(0, 20), unreviewedEntries: integer(0, 20),
  coverage: text(1000),
  rankings: z.array(z.strictObject({ rank: integer(1, 5), spotId: z.uuid(),
    name: text(200), address: text(500), lat: z.number(), lng: z.number(),
    venueUrl: httpsUrl, postCount: z.literal(1), summary: text(400),
    source: z.strictObject({ platform: z.literal("youtube"), kind: z.literal("venue_owned_channel"), label: text(200),
      channelId: z.string().check(z.regex(/^UC[A-Za-z0-9_-]{22}$/)), ownerUrl: httpsUrl, feedUrl: httpsUrl,
      videoId: z.string().check(z.regex(/^[A-Za-z0-9_-]{11}$/)), url: httpsUrl, title: text(1000),
      publishedAt: text(40), metrics: z.strictObject({ views: count, likes: count, comments: count, shares: count, saves: count }),
      bodySha256: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
    }),
  })).check(z.minLength(1), z.maxLength(5)),
});
export type NativeTrendPayload = z.infer<typeof nativeTrendPayloadSchema>;

export function currentUtcWeek(now: number) {
  const date = new Date(now); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
