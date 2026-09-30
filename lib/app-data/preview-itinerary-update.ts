import "server-only";
import { previewAppDataReader } from "./preview-db";
import { previewItineraryDetail } from "./preview-itinerary-detail";

export interface PreviewItineraryUpdate {
  title: unknown; city: unknown; activities: unknown; highlights: unknown; estimatedCost: unknown;
}

export async function updatePreviewItinerary(
  id: string, userId: string, input: PreviewItineraryUpdate,
): Promise<{ state: "missing" } | { state: "forbidden" } | { state: "found"; itinerary: Record<string, unknown> }> {
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200
    || typeof input.city !== "string" || !input.city.trim() || input.city.length > 150
    || !Array.isArray(input.highlights) || input.highlights.length > 50
    || input.highlights.some(item => typeof item !== "string" || item.length > 200)
    || (input.estimatedCost !== null && (typeof input.estimatedCost !== "string" || input.estimatedCost.length > 200))) {
    throw new RangeError("Invalid itinerary update");
  }
  if (!input.activities || typeof input.activities !== "object"
    || (!Array.isArray(input.activities)
      && !Array.isArray((input.activities as { dailyPlans?: unknown }).dailyPlans))) {
    throw new RangeError("Invalid itinerary activities");
  }
  const activities = JSON.stringify(input.activities);
  if (!activities || activities.length > 128_000) throw new RangeError("Invalid itinerary activities");
  const before = await previewItineraryDetail(id, userId);
  if (before.state !== "found") return before;
  if (before.itinerary.clerk_user_id !== userId) return { state: "forbidden" };

  const result = await previewAppDataReader().prepare(`UPDATE itineraries SET
    title = ?, city = ?, activities = ?, highlights = ?, estimated_cost = ?
    WHERE id = ? AND ownerId IN (SELECT o.id FROM owners o
      LEFT JOIN legacy_owners l ON l.ownerId = o.id
      WHERE (o.source = 'legacy-fixture' AND l.clerkUserId = ? AND o.id = l.clerkUserId)
        OR (o.source = 'new' AND o.id = ? AND l.ownerId IS NULL))`)
    .bind(input.title, input.city, activities, JSON.stringify(input.highlights), input.estimatedCost as string | null,
      id.toLowerCase(), userId, `auth:${userId}`).run();
  if (result.meta.changes !== 1) throw new Error("Preview itinerary update failed");
  return { state: "found", itinerary: { ...before.itinerary, title: input.title, city: input.city,
    activities: input.activities, highlights: input.highlights, estimated_cost: input.estimatedCost } };
}
