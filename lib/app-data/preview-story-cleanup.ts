import "server-only";
import { previewAppDataReader } from "./preview-db";
import { previewStoryBucket, previewStoryMediaUrl } from "./preview-story-media";

interface StoredStory { itineraryId: string; storySlides: string }
interface SlideRecord { expires_at?: unknown; slides?: unknown }

/** Delete expired preview PNGs, then clear only the metadata snapshot that named them. */
export async function cleanupPreviewStories(now = new Date()): Promise<{
  success: true; cleaned: number; filesDeleted: number; total: number;
} | { success: true; cleaned: 0 }> {
  const db = previewAppDataReader();
  const rows = await db.prepare(`SELECT itineraryId, storySlides FROM legacy_itinerary_media
    WHERE storySlides IS NOT NULL ORDER BY itineraryId LIMIT 501`).all<StoredStory>();
  if (!Array.isArray(rows.results) || rows.results.length > 500) {
    throw new Error("Preview story cleanup exceeds the bounded scan");
  }
  const expired: { id: string; snapshot: string; keys: string[] }[] = [];
  for (const row of rows.results) {
    if (typeof row.itineraryId !== "string" || typeof row.storySlides !== "string") {
      throw new Error("Invalid preview story row");
    }
    const parsed: unknown = JSON.parse(row.storySlides);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid preview story metadata");
    }
    const story = parsed as SlideRecord;
    if (typeof story.expires_at !== "string" || !Number.isFinite(Date.parse(story.expires_at))) continue;
    if (Date.parse(story.expires_at) >= now.getTime()) continue;
    if (!story.slides || typeof story.slides !== "object" || Array.isArray(story.slides)) {
      throw new Error("Invalid expired preview story slides");
    }
    const slides = Object.entries(story.slides);
    if (slides.length < 1 || slides.length > 32) throw new Error("Invalid expired preview slide count");
    const keys: string[] = [];
    for (const [slide, source] of slides) {
      if (typeof source !== "string" || !source.startsWith("r2://")
        || !source.endsWith(`/${slide}.png`)) throw new Error("Unmigrated preview story media");
      previewStoryMediaUrl(row.itineraryId, source);
      keys.push(source.slice(5));
    }
    expired.push({ id: row.itineraryId, snapshot: row.storySlides, keys: [...new Set(keys)] });
  }
  if (!expired.length) return { success: true, cleaned: 0 };

  const bucket = previewStoryBucket();
  let cleaned = 0;
  let filesDeleted = 0;
  for (const item of expired) {
    for (const key of item.keys) {
      await bucket.delete(key);
      filesDeleted++;
    }
    const result = await db.prepare(`UPDATE legacy_itinerary_media SET storySlides = NULL
      WHERE itineraryId = ? AND storySlides = ?`).bind(item.id, item.snapshot).run();
    if (result.meta.changes === 1) cleaned++;
    else if (result.meta.changes !== 0) throw new Error("Unexpected preview story cleanup write count");
  }
  return { success: true, cleaned, filesDeleted, total: expired.length };
}
