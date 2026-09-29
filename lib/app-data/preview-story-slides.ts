import "server-only";
import { previewAppDataReader } from "./preview-db";
import { previewStoryMediaUrl } from "./preview-story-media";

interface StoredStorySlides {
  generated_at: string;
  expires_at: string;
  tier: string;
  slides: Record<string, string>;
}

export type PreviewStorySlides =
  | { success: true; available: false }
  | { success: true; available: boolean; expired: boolean; slides: Record<string, string> | null;
      generatedAt: string; expiresAt: string; tier: string };

/** Read imported slide metadata without exposing another user's private itinerary. */
export async function previewStorySlides(id: string, userId: string | null): Promise<PreviewStorySlides | null> {
  const row = await previewAppDataReader().prepare(`SELECT m.storySlides AS storySlides
    FROM legacy_itinerary_media m
    JOIN itineraries i ON i.id = m.itineraryId
    JOIN legacy_owners o ON o.ownerId = i.ownerId
    WHERE m.itineraryId = ? AND (m.isPublic = 1 OR o.clerkUserId = ?)`)
    .bind(id, userId ?? "").first<{ storySlides: string | null }>();
  if (!row) return null;
  if (!row.storySlides) return { success: true, available: false };

  const parsed: unknown = JSON.parse(row.storySlides);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid story slides");
  const story = parsed as Partial<StoredStorySlides>;
  if (!story.slides) return { success: true, available: false };
  if (typeof story.generated_at !== "string" || !Number.isFinite(Date.parse(story.generated_at))
    || typeof story.expires_at !== "string" || !Number.isFinite(Date.parse(story.expires_at))
    || typeof story.tier !== "string" || !story.tier
    || typeof story.slides !== "object" || Array.isArray(story.slides)
    || Object.values(story.slides).some(value => typeof value !== "string")) {
    throw new Error("Invalid story slides");
  }
  const expired = Date.parse(story.expires_at) < Date.now();
  const slides = Object.fromEntries(Object.entries(story.slides).map(([slide, source]) =>
    [slide, previewStoryMediaUrl(id, source)]));
  return { success: true, available: !expired, expired, slides: expired ? null : slides,
    generatedAt: story.generated_at, expiresAt: story.expires_at, tier: story.tier };
}
