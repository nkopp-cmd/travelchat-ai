import "server-only";
import { previewFreshStoryWriteOwner } from "./preview-story-write-owner";
import { previewAppDataReader } from "./preview-db";
import { parsePreviewStoryPatch } from "./preview-story-metadata";
import { previewBackgroundId, previewBackgroundData } from "./preview-story-background-cache";

/** Bound the fresh JSON body before parsing it; legacy callers keep their existing reader. */
export async function readPreviewFreshBackgroundPatch(req: Request): Promise<Record<string, string> | null> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return parsePreviewStoryPatch(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
  } catch { return null; } finally { reader.releaseLock(); }
}

function backgroundIds(patch: Record<string, string>, days: number): string[] {
  if (!parsePreviewStoryPatch(patch)) throw new RangeError("Invalid backgrounds");
  const ids = Object.entries(patch).map(([slide, url]) => {
    const id = previewBackgroundId(url);
    if (!id || (slide.startsWith("day") && Number(slide.slice(3)) > days)) {
      throw new RangeError("Owned preview background required");
    }
    return id;
  });
  return [...new Set(ids)];
}

/** An absent media row is an empty fresh trip, never a source fallback. */
export async function previewFreshStoryBackgrounds(id: string, userId: string): Promise<Record<string, string> | null> {
  const owner = await previewFreshStoryWriteOwner(id, userId);
  if (!owner) return null;
  const row = await previewAppDataReader().prepare(`SELECT m.aiBackgrounds AS backgrounds
    FROM itineraries i LEFT JOIN legacy_itinerary_media m ON m.itineraryId=i.id
    JOIN owners o ON o.id=i.ownerId WHERE i.id=? AND i.ownerId=? AND o.source='new'
      AND NOT EXISTS(SELECT 1 FROM legacy_owners l WHERE l.clerkUserId=? OR l.ownerId=o.id)`)
    .bind(id, owner.ownerId, userId).first<{ backgrounds: string | null }>();
  if (!row) return null;
  if (row.backgrounds === null) return {};
  if (typeof row.backgrounds !== "string" || row.backgrounds.length > 65536) throw new Error("Invalid backgrounds");
  const patch: unknown = JSON.parse(row.backgrounds);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Invalid backgrounds");
  if (!Object.keys(patch).length) return {};
  const ids = backgroundIds(patch as Record<string, string>, owner.days);
  const owned = await previewAppDataReader().prepare(`SELECT COUNT(*) AS n FROM preview_story_backgrounds
    WHERE ownerId=? AND id IN(SELECT value FROM json_each(?))`)
    .bind(owner.ownerId, JSON.stringify(ids)).first<{ n: number }>();
  return owned?.n === ids.length ? patch as Record<string, string> : null;
}

/** Fresh-only upsert rechecks trip identity and every cache owner in the write statement. */
export async function updatePreviewFreshStoryBackgrounds(
  id: string, userId: string, patch: Record<string, string>,
): Promise<Record<string, string> | null> {
  const owner = await previewFreshStoryWriteOwner(id, userId);
  if (!owner) return null;
  const ids = backgroundIds(patch, owner.days);
  // Refuse invalid retained references before changing the row.
  if (!await previewFreshStoryBackgrounds(id, userId)) return null;
  for (const url of new Set(Object.values(patch))) {
    if (!await previewBackgroundData(url, userId)) throw new RangeError("Background not owned");
  }
  const result = await previewAppDataReader().prepare(`INSERT INTO legacy_itinerary_media(itineraryId,aiBackgrounds)
    SELECT i.id,? FROM itineraries i JOIN owners o ON o.id=i.ownerId
    WHERE i.id=? AND i.ownerId=? AND i.days=? AND o.source='new'
      AND NOT EXISTS(SELECT 1 FROM legacy_owners l WHERE l.clerkUserId=? OR l.ownerId=o.id)
      AND NOT EXISTS(SELECT 1 FROM json_each(?) x WHERE NOT EXISTS(
        SELECT 1 FROM preview_story_backgrounds b WHERE b.id=x.value AND b.ownerId=i.ownerId))
    ON CONFLICT(itineraryId) DO UPDATE SET
      aiBackgrounds=json_patch(coalesce(legacy_itinerary_media.aiBackgrounds,'{}'),excluded.aiBackgrounds)`)
    .bind(JSON.stringify(patch), id, owner.ownerId, owner.days, userId, JSON.stringify(ids)).run();
  if (result.meta.changes === 0) return null;
  if (result.meta.changes !== 1) throw new Error("Invalid background write count");
  return previewFreshStoryBackgrounds(id, userId);
}
