import "server-only";
import { currentUser } from "@/lib/auth/server";
import { previewAppDataReader } from "./preview-db";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { normalizeDailyPlansForDisplay, parseDailyPlans } from "@/lib/itineraries/normalize-daily-plans";

interface ExportRow {
  id: string; title: string; city: string; days: number; activities: string;
  highlights: string | null; estimated_cost: string | null; local_score: number | null;
}

/** Private reserved fresh-owner export; imported ownership and shared exports stay gated. */
export async function previewItineraryExport(id: string, userId: string) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) return null;
  const owners = await ownerIds(userId);
  if (owners.legacy || owners.fresh !== newOwnerId(userId)) return null;
  const row = await previewAppDataReader().prepare(`SELECT i.id,i.title,i.city,i.days,i.activities,
    i.highlights,i.estimated_cost,i.local_score FROM itineraries i JOIN owners o ON o.id=i.ownerId
    WHERE i.id=? AND i.ownerId=? AND o.source='new'
    AND NOT EXISTS (SELECT 1 FROM legacy_owners l WHERE l.clerkUserId=? OR l.ownerId=o.id)`)
    .bind(id.toLowerCase(), owners.fresh, userId).first<ExportRow>();
  if (!row) return null;
  if (row.id !== id.toLowerCase() || typeof row.title !== "string" || !row.title || row.title.length > 200
    || typeof row.city !== "string" || !row.city || row.city.length > 100
    || !Number.isSafeInteger(row.days) || row.days < 1 || row.days > 30
    || typeof row.activities !== "string" || row.activities.length > 65536
    || (row.highlights !== null && (typeof row.highlights !== "string" || row.highlights.length > 8192))
    || (row.estimated_cost !== null && (typeof row.estimated_cost !== "string" || row.estimated_cost.length > 300))
    || (row.local_score !== null && (!Number.isFinite(row.local_score) || row.local_score < 0 || row.local_score > 10))) {
    throw new Error("Invalid preview export");
  }
  const activities: unknown = JSON.parse(row.activities);
  const highlights: unknown = row.highlights === null ? [] : JSON.parse(row.highlights);
  if (!activities || typeof activities !== "object" || !Array.isArray(highlights) || highlights.length > 20
    || highlights.some(value => typeof value !== "string" || value.length > 300)) throw new Error("Invalid preview export content");
  const { dailyPlans } = normalizeDailyPlansForDisplay<{ day?: number; activities?: { name?: string }[] }>(parseDailyPlans(activities));
  if (dailyPlans.length !== row.days || dailyPlans.some((day, index) => day.day !== index + 1
    || !Array.isArray(day.activities) || day.activities.length < 1 || day.activities.length > 50
    || day.activities.some(activity => !activity || typeof activity.name !== "string"
      || !activity.name || activity.name.length > 200))) throw new Error("Invalid preview export schedule");
  return { ...row, activities, highlights: highlights as string[], clerk_user_id: userId, shared: false };
}
