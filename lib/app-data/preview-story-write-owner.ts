import "server-only";
import { currentUser } from "@/lib/auth/server";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

/** Fresh private writes require the same verified reserved identity as the gallery. */
export async function previewFreshStoryWriteOwner(id: string, userId: string): Promise<{
  storySlides: string | null; ownerId: string; days: number;
} | null> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) return null;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) return null;
  const owners = await ownerIds(userId);
  if (owners.legacy || owners.fresh !== newOwnerId(userId)) return null;
  const row = await previewAppDataReader().prepare(`SELECT m.storySlides, i.ownerId, i.days
    FROM itineraries i JOIN owners o ON o.id = i.ownerId
    LEFT JOIN legacy_itinerary_media m ON m.itineraryId = i.id
    WHERE i.id = ? AND i.ownerId = ? AND o.source = 'new'
      AND NOT EXISTS (SELECT 1 FROM legacy_owners l WHERE l.clerkUserId = ? OR l.ownerId = o.id)`)
    .bind(id, owners.fresh, userId).first<{ storySlides: string | null; ownerId: string; days: number }>();
  if (row && (row.ownerId !== owners.fresh || !Number.isSafeInteger(row.days) || row.days < 1 || row.days > 30)) {
    throw new Error("Invalid preview story itinerary");
  }
  return row;
}
