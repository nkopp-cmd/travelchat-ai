import "server-only";
import type { Spot } from "@/types";
import { dataBackend } from "@/lib/app-data/backend";
import { d1SpotCardsByIds } from "@/lib/spots/d1-queries";
import { transformSpot } from "@/lib/spots/transform";
import { parseViralFeed, viralSpotRefs, VIRAL_EVENTS_KEY, VIRAL_SLUG, type ViralEvent, type ViralFeed } from "./feed";

type Bucket = { get(key: string): Promise<{ json<T>(): Promise<T> } | null> };

function bucket(): Bucket | null {
  return (globalThis as Record<symbol, { env?: { COMMUNITY_MEDIA?: Bucket } } | undefined>)[Symbol.for("__cloudflare-context__")]?.env?.COMMUNITY_MEDIA ?? null;
}

// One R2 read per isolate every 5 minutes; the scout writes the file every 2 hours.
const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; value: Promise<ViralFeed | null> } | null = null;

export function readViralFeed(): Promise<ViralFeed | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = (async () => {
    const media = dataBackend() === "d1" ? bucket() : null;
    if (!media) return null;
    try {
      const object = await media.get(VIRAL_EVENTS_KEY);
      return object ? parseViralFeed(await object.json()) : null;
    } catch (error) {
      console.error("[viral] feed unavailable:", error instanceof Error ? error.message : error);
      return null;
    }
  })();
  cached = { at: Date.now(), value };
  return value;
}

export type ViralSpot = { spot: Spot; note: string | null; event: Pick<ViralEvent, "slug" | "label"> };

async function cards(refs: { spotId: string }[]): Promise<Map<string, Spot>> {
  if (!refs.length) return new Map();
  const rows = await d1SpotCardsByIds(refs.map((ref) => ref.spotId));
  return new Map(rows.map((row) => [row.id, transformSpot(row)]));
}

/** "Viral this week" rail: visible spots only (hidden or removed spots drop out). */
export async function fetchViralSpots(citySlug: string | null): Promise<ViralSpot[]> {
  try {
    const refs = viralSpotRefs(await readViralFeed(), citySlug);
    const spots = await cards(refs);
    return refs.flatMap((ref) => {
      const spot = spots.get(ref.spotId);
      return spot ? [{ spot, note: ref.note, event: ref.event }] : [];
    });
  } catch (error) {
    console.error("[viral] rail unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function fetchViralEvents(): Promise<ViralEvent[]> {
  return (await readViralFeed())?.events ?? [];
}

/** One event with its visible spots, or null when the slug is unknown. */
export async function fetchViralEvent(slug: string): Promise<{ event: ViralEvent; spots: { spot: Spot; note: string | null }[] } | null> {
  if (!VIRAL_SLUG.test(slug)) return null;
  const event = (await readViralFeed())?.events.find((item) => item.slug === slug);
  if (!event) return null;
  const spots = await cards(event.spots);
  return { event, spots: event.spots.flatMap((ref) => {
    const spot = spots.get(ref.spotId);
    return spot ? [{ spot, note: ref.note ?? null }] : [];
  }) };
}
