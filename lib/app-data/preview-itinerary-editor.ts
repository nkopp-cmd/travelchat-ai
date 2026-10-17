import "server-only";
import { currentUser } from "@/lib/auth/server";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

export class PreviewEditorDeniedError extends Error {
  constructor() { super("Itinerary unavailable"); }
}

export function isPreviewEditorIntent(host: string | null, flag: unknown): boolean {
  return flag === "d1" && typeof host === "string"
    && /^localley-next-preview\.nkopp\.workers\.dev(?::[0-9]+)?$/i.test(host);
}

export async function assertPreviewEditorOwner(userId: string): Promise<string> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email)) throw new PreviewEditorDeniedError();
  const owners = await ownerIds(userId);
  if (owners.legacy || owners.fresh !== newOwnerId(userId)) throw new PreviewEditorDeniedError();
  return owners.fresh;
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
/** Validate editable data without projecting away activity coordinates, costs or other saved fields. */
export function validatePreviewEditorContent(input: {
  title: unknown; city: unknown; activities: unknown; highlights: unknown; estimatedCost: unknown;
}, days: number): void {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200
    || typeof input.city !== "string" || !input.city.trim() || input.city.length > 100
    || !Number.isSafeInteger(days) || days < 1 || days > 30
    || !Array.isArray(input.highlights) || input.highlights.length > 20
    || input.highlights.some(v => typeof v !== "string" || v.length > 200)
    || JSON.stringify(input.highlights).length > 8192
    || (input.estimatedCost !== null && (typeof input.estimatedCost !== "string" || input.estimatedCost.length > 200))) {
    throw new RangeError("Invalid itinerary update");
  }
  const value = input.activities;
  const plans = Array.isArray(value) ? value : object(value) ? value.dailyPlans : null;
  if (!Array.isArray(plans) || plans.length > 30 || JSON.stringify(value).length > 65536) throw new RangeError("Invalid itinerary activities");
  const seen = new Set<number>();
  for (const day of plans) {
    if (!object(day) || !Number.isSafeInteger(day.day) || (day.day as number) < 1 || (day.day as number) > days
      || seen.has(day.day as number) || !Array.isArray(day.activities) || day.activities.length > 50
      || (day.theme != null && (typeof day.theme !== "string" || day.theme.length > 300))) throw new RangeError("Invalid itinerary schedule");
    seen.add(day.day as number);
    for (const activity of day.activities) {
      if (!object(activity) || typeof activity.name !== "string" || !activity.name || activity.name.length > 200) throw new RangeError("Invalid itinerary activity");
      for (const [key, limit] of Object.entries({ description: 2000, time: 100, duration: 200, cost: 200, address: 500, type: 100 })) {
        const field = activity[key];
        if (field != null && (typeof field !== "string" || field.length > limit)) throw new RangeError("Invalid itinerary activity");
      }
      if (activity.localleyScore != null && (typeof activity.localleyScore !== "number" || !Number.isFinite(activity.localleyScore))) throw new RangeError("Invalid itinerary score");
    }
  }
  if (object(value) && value.insights !== undefined && (!Array.isArray(value.insights) || value.insights.length > 50
    || value.insights.some(v => !object(v) || typeof v.text !== "string" || v.text.length > 2000
      || typeof v.id !== "string" || v.id.length > 200 || typeof v.label !== "string" || v.label.length > 200
      || !["local", "transport", "insight"].includes(v.kind as string)))) throw new RangeError("Invalid itinerary insights");
}

interface Row { id: string; title: string; city: string; days: number; activities: string;
  highlights: string | null; estimated_cost: string | null }

export async function previewItineraryEditor(id: string, userId: string | null) {
  if (!userId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  let owner: string;
  try { owner = await assertPreviewEditorOwner(userId); }
  catch (error) { if (error instanceof PreviewEditorDeniedError) return null; throw error; }
  const row = await previewAppDataReader().prepare(`SELECT i.id,i.title,i.city,i.days,i.activities,i.highlights,i.estimated_cost
    FROM itineraries i JOIN owners o ON o.id=i.ownerId
    WHERE i.id=? AND i.ownerId=? AND o.source='new'
    AND NOT EXISTS(SELECT 1 FROM legacy_owners l WHERE l.clerkUserId=? OR l.ownerId=o.id)`)
    .bind(id.toLowerCase(), owner, userId).first<Row>();
  if (!row) return null;
  if (row.id !== id.toLowerCase() || typeof row.activities !== "string" || row.activities.length > 65536
    || (row.highlights !== null && (typeof row.highlights !== "string" || row.highlights.length > 8192))) throw new Error("Invalid editor data");
  const activities: unknown = JSON.parse(row.activities);
  const highlights: unknown = row.highlights === null ? [] : JSON.parse(row.highlights);
  validatePreviewEditorContent({ ...row, activities, highlights, estimatedCost: row.estimated_cost }, row.days);
  return { id: row.id, title: row.title, city: row.city, days: row.days, activities,
    highlights: highlights as string[], estimated_cost: row.estimated_cost ?? undefined };
}
