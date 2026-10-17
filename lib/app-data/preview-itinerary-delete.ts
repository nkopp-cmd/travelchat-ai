import "server-only";
import { previewAppDataReader } from "./preview-db";
import { previewItineraryDetail } from "./preview-itinerary-detail";
import { assertPreviewEditorOwner } from "./preview-itinerary-editor";

// Recheck identity provenance and media eligibility in every statement of the atomic batch.
// Media-backed deletion needs its own accepted object cleanup; never orphan those references.
const deletable = `SELECT i.id FROM itineraries i JOIN owners o ON o.id=i.ownerId
  WHERE i.id=? AND i.ownerId=? AND o.source='new'
    AND NOT EXISTS(SELECT 1 FROM legacy_owners l WHERE l.clerkUserId=? OR l.ownerId=i.ownerId)
    AND NOT EXISTS(SELECT 1 FROM legacy_itinerary_media m WHERE m.itineraryId=i.id
      AND (m.aiBackgrounds IS NOT NULL OR m.storySlides IS NOT NULL))`;

/** Keep conversation history while removing its link, then remove empty metadata and the fresh trip atomically. */
export async function deletePreviewItinerary(id: string, userId: string): Promise<"missing" | "forbidden" | "deleted"> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return "missing";
  const ownerId = await assertPreviewEditorOwner(userId);
  const before = await previewItineraryDetail(id, userId);
  if (before.state !== "found") return before.state;
  if (before.itinerary.clerk_user_id !== userId) return "forbidden";

  const db = previewAppDataReader();
  const args = [id.toLowerCase(), ownerId, userId];
  const results = await db.batch([
    db.prepare(`UPDATE conversations SET linkedItineraryId = NULL
      WHERE linkedItineraryId IN (${deletable})`).bind(...args),
    db.prepare(`DELETE FROM legacy_itinerary_media WHERE itineraryId IN (${deletable})`).bind(...args),
    db.prepare(`DELETE FROM itineraries WHERE id IN (${deletable}) RETURNING id`).bind(...args),
  ]);
  if (!Array.isArray(results) || results.length !== 3) throw new Error("Preview itinerary delete failed");
  // D1 meta.changes includes cascaded likes. Validate the directly deleted primary key instead.
  const deleted = results[2]?.results;
  if (!Array.isArray(deleted)) throw new Error("Preview itinerary delete failed");
  if (deleted.length === 0) return "forbidden";
  if (deleted.length !== 1 || deleted[0]?.id !== id.toLowerCase()) throw new Error("Preview itinerary delete failed");
  return "deleted";
}
