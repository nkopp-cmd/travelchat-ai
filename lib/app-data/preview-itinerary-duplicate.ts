import "server-only";
import { randomUUID } from "node:crypto";
import { assertPreviewEditorOwner } from "./preview-itinerary-editor";
import { previewAppDataReader } from "./preview-db";
import { previewItineraryDetail } from "./preview-itinerary-detail";

/** Copy only a verified fresh owner's trip. Shared/imported copying needs separate acceptance. */
export async function duplicatePreviewItinerary(id: string, userId: string): Promise<
  { state: "missing" } | { state: "forbidden" } | { state: "found"; itinerary: Record<string, unknown> }
> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return { state: "missing" };
  const ownerId = await assertPreviewEditorOwner(userId);
  const before = await previewItineraryDetail(id, userId);
  if (before.state !== "found") return before;
  if (before.itinerary.clerk_user_id !== userId) return { state: "forbidden" };
  const copyId = randomUUID();
  const db = previewAppDataReader();
  // Recheck ownership in the write. Do not copy media, sharing codes, likes or counters.
  const result = await db.prepare(`INSERT INTO itineraries
    (id,ownerId,title,subtitle,city,days,activities,local_score,highlights,estimated_cost,
      status,is_favorite,shared,share_code,created_at)
    SELECT ?,i.ownerId,i.title || ' (Copy)',i.subtitle,i.city,i.days,i.activities,
      i.local_score,i.highlights,i.estimated_cost,'draft',0,0,NULL,?
    FROM itineraries i JOIN owners o ON o.id=i.ownerId
    WHERE i.id=? AND i.ownerId=? AND o.source='new'
      AND NOT EXISTS (SELECT 1 FROM legacy_owners l WHERE l.clerkUserId=? OR l.ownerId=i.ownerId)`)
    .bind(copyId, new Date().toISOString(), id.toLowerCase(), ownerId, userId).run();
  if (result.meta.changes === 0) return { state: "forbidden" };
  if (result.meta.changes !== 1) throw new Error("Preview itinerary copy failed");
  const copy = await previewItineraryDetail(copyId, userId);
  if (copy.state !== "found" || copy.itinerary.clerk_user_id !== userId) {
    throw new Error("Preview itinerary copy readback failed");
  }
  return copy;
}
