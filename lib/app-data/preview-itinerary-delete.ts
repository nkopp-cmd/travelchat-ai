import "server-only";
import { previewAppDataReader } from "./preview-db";
import { previewItineraryDetail } from "./preview-itinerary-detail";

const ownerSelect = `SELECT o.id FROM owners o LEFT JOIN legacy_owners l ON l.ownerId = o.id
  WHERE (o.source = 'legacy-fixture' AND o.id = l.clerkUserId AND l.clerkUserId = ?)
    OR (o.source = 'new' AND o.id = ? AND l.ownerId IS NULL)`;

/** Keep conversation history while removing its link, then remove metadata and the itinerary atomically. */
export async function deletePreviewItinerary(id: string, userId: string): Promise<"missing" | "forbidden" | "deleted"> {
  const before = await previewItineraryDetail(id, userId);
  if (before.state !== "found") return before.state;
  if (before.itinerary.clerk_user_id !== userId) return "forbidden";

  const db = previewAppDataReader();
  const normalizedId = id.toLowerCase();
  const ownerId = `auth:${userId}`;
  const results = await db.batch([
    db.prepare(`UPDATE conversations SET linkedItineraryId = NULL
      WHERE linkedItineraryId = ? AND EXISTS (SELECT 1 FROM itineraries i
        WHERE i.id = conversations.linkedItineraryId AND i.ownerId IN (${ownerSelect}))`)
      .bind(normalizedId, userId, ownerId),
    db.prepare(`DELETE FROM legacy_itinerary_media WHERE itineraryId = ?
      AND EXISTS (SELECT 1 FROM itineraries i WHERE i.id = legacy_itinerary_media.itineraryId
        AND i.ownerId IN (${ownerSelect}))`)
      .bind(normalizedId, userId, ownerId),
    db.prepare(`DELETE FROM itineraries WHERE id = ? AND ownerId IN (${ownerSelect})`)
      .bind(normalizedId, userId, ownerId),
  ]);
  if (!Array.isArray(results) || results.length !== 3 || results[2]?.meta?.changes !== 1) {
    throw new Error("Preview itinerary delete failed");
  }
  return "deleted";
}
