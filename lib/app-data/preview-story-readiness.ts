import "server-only";
import { previewStoryGallery } from "./preview-story-gallery";
import { previewStoryMediaKey } from "./preview-story-media";
import { previewStorySlideBytes, previewStoryTotalBytes } from "./preview-story-upload";

interface StoredObject { key: string; size: number; httpMetadata?: { contentType?: string } }

/** Readiness is an observed private snapshot, never a promise of future retention. */
export async function previewStoryReady(id: string, userId: string): Promise<boolean> {
  const gallery = await previewStoryGallery(id, userId);
  if (!gallery?.story_slides || gallery.expired) return false;
  const slides = gallery.story_slides.slides;
  const expected = ["cover", ...Array.from({ length: gallery.days }, (_, i) => `day${i + 1}`), "summary"];
  if (Object.keys(slides).length !== expected.length || expected.some(slide => !slides[slide])) return false;
  const keys: string[] = [];
  let generation: string | undefined;
  for (const slide of expected) {
    const url = new URL(slides[slide]);
    const current = url.pathname.split("/")[6];
    const key = previewStoryMediaKey(id, current, slide);
    if (!key || (generation && generation !== current)
      || url.origin !== "https://localley-next-preview.nkopp.workers.dev"
      || url.pathname !== `/api/itineraries/${id}/story/media/${current}/${slide}`) return false;
    generation = current;
    keys.push(key);
  }
  const context = (globalThis as Record<symbol, { env?: { STORY_PREVIEW_MEDIA?: unknown } } | undefined>)
    [Symbol.for("__cloudflare-context__")];
  const bucket = context?.env?.STORY_PREVIEW_MEDIA;
  if (!bucket || typeof bucket !== "object" || !("head" in bucket) || typeof bucket.head !== "function") {
    throw new Error("Story readiness storage unavailable");
  }
  const head = bucket.head.bind(bucket) as (key: string) => Promise<StoredObject | null>;
  let totalBytes = 0;
  for (const key of keys) {
    const object = await head(key);
    if (!object || object.key !== key || !Number.isSafeInteger(object.size) || object.size < 8
      || object.size > previewStorySlideBytes || object.httpMetadata?.contentType !== "image/png") return false;
    totalBytes += object.size;
    if (totalBytes > previewStoryTotalBytes) return false;
  }
  // Recheck ownership, expiry and gallery references after R2 reads. Refuse a changed generation.
  const current = await previewStoryGallery(id, userId);
  return JSON.stringify(current) === JSON.stringify(gallery);
}
