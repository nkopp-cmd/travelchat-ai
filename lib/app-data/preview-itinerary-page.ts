import "server-only";
import { currentUser } from "@/lib/auth/server";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";
import { buildItineraryDisplayPayload } from "@/lib/itineraries/display-payload";
import type { DayRoutePlan } from "@/components/itinerary/day-route-section";

interface Row { id: string; title: string; city: string; days: number; activities: string;
  subtitle: string | null; highlights: string | null; local_score: number | null }

/** Private fresh-owner view only. Sharing, historical rows and provider calls stay gated. */
export async function previewItineraryPage(id: string, userId: string | null) {
  if (!userId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) return null;
  const owners = await ownerIds(userId);
  if (owners.legacy || owners.fresh !== newOwnerId(userId)) return null;
  const row = await previewAppDataReader().prepare(`SELECT i.id,i.title,i.city,i.days,i.activities,
    i.subtitle,i.highlights,i.local_score FROM itineraries i JOIN owners o ON o.id=i.ownerId
    WHERE i.id=? AND i.ownerId=? AND o.source='new'
    AND NOT EXISTS (SELECT 1 FROM legacy_owners l WHERE l.clerkUserId=? OR l.ownerId=o.id)`)
    .bind(id.toLowerCase(), owners.fresh, userId).first<Row>();
  if (!row) return null;
  if (row.id !== id.toLowerCase() || typeof row.title !== "string" || !row.title || row.title.length > 200
    || typeof row.city !== "string" || !row.city || row.city.length > 100
    || !Number.isSafeInteger(row.days) || row.days < 1 || row.days > 30
    || (row.subtitle !== null && (typeof row.subtitle !== "string" || row.subtitle.length > 500))
    || (row.local_score !== null && (!Number.isFinite(row.local_score) || row.local_score < 0 || row.local_score > 10))
    || typeof row.activities !== "string" || row.activities.length > 65536
    || (row.highlights !== null && (typeof row.highlights !== "string" || row.highlights.length > 8192))) {
    throw new Error("Invalid preview itinerary");
  }
  const highlights: unknown = row.highlights === null ? [] : JSON.parse(row.highlights);
  if (!Array.isArray(highlights) || highlights.length > 20
    || highlights.some(value => typeof value !== "string" || value.length > 300)) throw new Error("Invalid preview highlights");
  // Preserve the existing display normalization, but omit image URLs and provider actions.
  JSON.parse(row.activities);
  const { dailyPlans, insights } = buildItineraryDisplayPayload<DayRoutePlan>(row.activities);
  if (dailyPlans.length > 30 || dailyPlans.some(day => !Number.isSafeInteger(day.day) || day.day < 1
    || day.day > row.days || !Array.isArray(day.activities) || day.activities.length > 50)) {
    throw new Error("Invalid preview schedule");
  }
  const safeDays = dailyPlans.map(day => ({ day: day.day,
    theme: typeof day.theme === "string" ? day.theme.slice(0, 300) : undefined,
    activities: day.activities.map(activity => {
      if (!activity || typeof activity.name !== "string" || !activity.name || activity.name.length > 200)
        throw new Error("Invalid preview activity");
      return { name: activity.name,
        description: typeof activity.description === "string" ? activity.description.slice(0, 2000) : undefined,
        time: typeof activity.time === "string" ? activity.time.slice(0, 100) : undefined,
        address: typeof activity.address === "string" ? activity.address.slice(0, 500) : undefined };
    }) }));
  return { id: row.id, title: row.title, city: row.city, days: row.days, subtitle: row.subtitle,
    localScore: row.local_score, highlights: highlights as string[], dailyPlans: safeDays, insights };
}
