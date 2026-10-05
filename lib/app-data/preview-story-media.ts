import "server-only";
import { randomUUID } from "node:crypto";
import { previewAppDataReader } from "./preview-db";
import { previewFreshStoryWriteOwner } from "./preview-story-write-owner";
import { previewStorySlideBytes, previewStoryTotalBytes } from "./preview-story-upload";

const contextSymbol = Symbol.for("__cloudflare-context__");
const previewHost = "https://localley-next-preview.nkopp.workers.dev";
const slidePattern = /^(cover|summary|day(?:[1-9]|[12]\d|30))$/;
const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
const mediaKeyPattern = /^story-slides\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/(cover|summary|day(?:[1-9]|[12]\d|30))\.png$/;

interface PreviewStoryObject { arrayBuffer(): Promise<ArrayBuffer> }
interface PreviewStoryBucket {
  put(key: string, body: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<PreviewStoryObject | null>;
  delete(key: string): Promise<void>;
}

export function previewStoryBucket(): PreviewStoryBucket {
  if (process.env.SUPABASE_READ_ONLY !== "true" || process.env.AUTH_MAIL_MODE !== "outbox") {
    throw new Error("Preview story media requires the isolated preview");
  }
  const context = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[contextSymbol];
  const bucket = context?.env?.STORY_PREVIEW_MEDIA;
  if (!bucket || typeof bucket !== "object" || !("put" in bucket) || typeof bucket.put !== "function"
    || !("get" in bucket) || typeof bucket.get !== "function"
    || !("delete" in bucket) || typeof bucket.delete !== "function") {
    throw new Error("STORY_PREVIEW_MEDIA is not configured");
  }
  return bucket as PreviewStoryBucket;
}

export function previewStoryMediaUrl(id: string, source: string): string {
  if (!source.startsWith("r2://")) return source;
  const key = source.slice(5);
  const match = mediaKeyPattern.exec(key);
  if (!match || match[1] !== id) throw new Error("Invalid preview story media key");
  return `${previewHost}/api/itineraries/${id}/story/media/${match[2]}/${match[3]}?data_candidate=d1`;
}

export function previewStoryMediaKey(id: string, generationId: string, slide: string): string | null {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
    || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(generationId)
    || !slidePattern.test(slide)) return null;
  return `story-slides/${id}/${generationId}/${slide}.png`;
}

interface StoryInput { slide: string; value: Blob }

export async function previewStoryOwner(id: string, userId: string, fresh = false): Promise<boolean> {
  if (fresh) return !!await previewFreshStoryWriteOwner(id, userId);
  const row = await previewAppDataReader().prepare(`SELECT 1 AS owned FROM legacy_itinerary_media m
    JOIN itineraries i ON i.id = m.itineraryId
    JOIN legacy_owners o ON o.ownerId = i.ownerId
    WHERE m.itineraryId = ? AND o.clerkUserId = ?`).bind(id, userId).first<{ owned: number }>();
  return row?.owned === 1;
}

export async function savePreviewStoryMedia(
  id: string, userId: string, form: FormData, tier: string, retentionDays: number, fresh = false,
): Promise<{ slides: Record<string, string>; expiresAt: string; retentionDays: number; tier: string } | null> {
  const db = previewAppDataReader();
  const freshOwner = fresh ? await previewFreshStoryWriteOwner(id, userId) : null;
  if (fresh && !freshOwner) return null;
  const row = freshOwner ?? await db.prepare(`SELECT m.storySlides AS storySlides FROM legacy_itinerary_media m
    JOIN itineraries i ON i.id = m.itineraryId
    JOIN legacy_owners o ON o.ownerId = i.ownerId
    WHERE m.itineraryId = ? AND o.clerkUserId = ?`).bind(id, userId).first<{ storySlides: string | null }>();
  if (!row) return null;

  const entries = [...form.entries()];
  if (!entries.length || entries.length > 32) throw new RangeError("Invalid story slide count");
  const inputs: StoryInput[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const [slide, value] of entries) {
    if (!slidePattern.test(slide) || seen.has(slide) || !(value instanceof Blob)
      || value.size < 8 || value.size > previewStorySlideBytes
      || (freshOwner && slide.startsWith("day") && Number(slide.slice(3)) > freshOwner.days)) {
      throw new RangeError("Invalid story slide");
    }
    totalBytes += value.size;
    if (totalBytes > previewStoryTotalBytes) throw new RangeError("Story upload is too large");
    seen.add(slide);
    const header = new Uint8Array(await value.slice(0, 8).arrayBuffer());
    if (!pngHeader.every((byte, index) => header[index] === byte)) throw new RangeError("Invalid PNG slide");
    inputs.push({ slide, value });
  }

  const oldKeys: string[] = [];
  if (row.storySlides) {
    const parsed: unknown = JSON.parse(row.storySlides);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const slides = (parsed as { slides?: unknown }).slides;
      if (slides && typeof slides === "object" && !Array.isArray(slides)) {
        for (const source of Object.values(slides)) {
          if (typeof source === "string" && source.startsWith("r2://")) {
            const key = source.slice(5);
            if (mediaKeyPattern.test(key) && key.startsWith(`story-slides/${id}/`)) oldKeys.push(key);
          }
        }
      }
    }
  }

  const bucket = previewStoryBucket();
  const generationId = randomUUID();
  const stored: string[] = [];
  const rawSlides: Record<string, string> = {};
  let writeAttempted = false;
  let recordJson: string | null = null;
  try {
    for (const input of inputs) {
      const key = previewStoryMediaKey(id, generationId, input.slide);
      if (!key) throw new RangeError("Invalid itinerary ID");
      stored.push(key);
      const bytes = new Uint8Array(await input.value.arrayBuffer());
      const uploaded = await bucket.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
      if (!uploaded) throw new Error("Story media upload failed");
      rawSlides[input.slide] = `r2://${key}`;
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + retentionDays * 86400000).toISOString();
    const record = { generated_at: now.toISOString(), expires_at: expiresAt, tier, slides: rawSlides };
    recordJson = JSON.stringify(record);
    const slides = Object.fromEntries(Object.entries(rawSlides).map(([slide, source]) =>
      [slide, `${previewStoryMediaUrl(id, source)}${fresh ? "&gallery_candidate=fresh" : ""}`]));
    writeAttempted = true;
    const result = freshOwner ? await db.prepare(`INSERT INTO legacy_itinerary_media(itineraryId, storySlides)
      SELECT i.id, ? FROM itineraries i JOIN owners o ON o.id = i.ownerId
      WHERE i.id = ? AND i.ownerId = ? AND o.source = 'new'
        AND NOT EXISTS (SELECT 1 FROM legacy_owners l WHERE l.clerkUserId = ? OR l.ownerId = o.id)
      ON CONFLICT(itineraryId) DO UPDATE SET storySlides = excluded.storySlides`)
      .bind(recordJson, id, freshOwner.ownerId, userId).run()
      : await db.prepare(`UPDATE legacy_itinerary_media SET storySlides = ?
      WHERE itineraryId = ? AND EXISTS (
        SELECT 1 FROM itineraries i JOIN legacy_owners o ON o.ownerId = i.ownerId
        WHERE i.id = legacy_itinerary_media.itineraryId AND o.clerkUserId = ?
      )`).bind(recordJson, id, userId).run();
    if (result.meta.changes !== 1) throw new Error("Story metadata write did not match owner");
    for (const key of oldKeys) {
      try { await bucket.delete(key); } catch (error) { console.error("[STORY_PREVIEW] Old object cleanup failed", error); }
    }
    return { slides, expiresAt, retentionDays, tier };
  } catch (error) {
    let deleteNewObjects = !writeAttempted;
    if (writeAttempted) {
      try {
        const current = await db.prepare("SELECT storySlides FROM legacy_itinerary_media WHERE itineraryId = ?")
          .bind(id).first<{ storySlides: string | null }>();
        deleteNewObjects = current?.storySlides !== recordJson;
      } catch (checkError) {
        // Keep the new objects when D1 cannot confirm whether its write committed.
        console.error("[STORY_PREVIEW] Commit state unknown; preserving uploaded objects", checkError);
      }
    }
    if (deleteNewObjects) for (const key of stored) {
      try { await bucket.delete(key); } catch (cleanupError) { console.error("[STORY_PREVIEW] New object cleanup failed", cleanupError); }
    }
    throw error;
  }
}
