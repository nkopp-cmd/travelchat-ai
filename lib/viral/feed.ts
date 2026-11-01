import { z } from "zod";

/** R2 key (COMMUNITY_MEDIA) of the public viral-events file; scripts/viral-scout.mjs writes it from the agent host. */
export const VIRAL_EVENTS_KEY = "viral/events.json";
export const VIRAL_SLUG = /^[a-z0-9][a-z0-9-]{2,95}$/;

const source = z.object({
  title: z.string().max(300),
  url: z.string().url().refine((url) => /^https?:\/\//.test(url)),
  publisher: z.string().max(120),
  date: z.string().nullable(),
});
const event = z.object({
  slug: z.string().regex(VIRAL_SLUG),
  label: z.string().min(1).max(160),
  person: z.string().max(120),
  city: z.string().max(60),
  citySlug: z.string().max(40),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  summary: z.string().nullable().optional().transform((text) => text?.slice(0, 600) ?? null),
  firstSeen: z.string(),
  lastSeen: z.string(),
  articleCount: z.number().int().nonnegative(),
  sources: z.array(source).max(20),
  spots: z.array(z.object({ spotId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/), note: z.string().nullable().optional().transform((text) => text?.slice(0, 300) ?? null) })).max(40),
});
const feed = z.object({ version: z.literal(1), updatedAt: z.string(), events: z.array(z.unknown()).max(60) });

export type ViralEvent = z.infer<typeof event>;
export type ViralFeed = { version: 1; updatedAt: string; events: ViralEvent[] };

/** Validated feed, or null when the file is broken; one invalid event is dropped, not the whole feed. */
export function parseViralFeed(value: unknown): ViralFeed | null {
  const parsed = feed.safeParse(value);
  if (!parsed.success) return null;
  const events = parsed.data.events.flatMap((item) => {
    const valid = event.safeParse(item);
    return valid.success ? [valid.data] : [];
  });
  return { version: 1, updatedAt: parsed.data.updatedAt, events };
}

export type ViralSpotRef = { spotId: string; note: string | null; event: Pick<ViralEvent, "slug" | "label"> };

/** Spot ids for the rail: newest events first, one entry per spot, optionally one city. */
export function viralSpotRefs(data: ViralFeed | null, citySlug: string | null, limit = 10): ViralSpotRef[] {
  const seen = new Set<string>();
  const refs: ViralSpotRef[] = [];
  for (const item of data?.events ?? []) {
    if (citySlug && item.citySlug !== citySlug) continue;
    for (const spot of item.spots) {
      if (seen.has(spot.spotId)) continue;
      seen.add(spot.spotId);
      refs.push({ spotId: spot.spotId, note: spot.note ?? null, event: { slug: item.slug, label: item.label } });
      if (refs.length >= limit) return refs;
    }
  }
  return refs;
}
