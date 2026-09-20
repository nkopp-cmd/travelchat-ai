import { LUNA_MODEL, lunaRequest } from "./luna";
import { reserveAIRequest, settleAIRequest } from "./ai-requests";

export type CatalogActivity = Record<string, unknown> & { spotId: string; name: string };
export type PlannedDay = { day: number; activities: CatalogActivity[] };

// The model may choose IDs and order, never supply venue facts, costs, or geometry.
export function validateAIPlan(text: string, count: number, catalog: CatalogActivity[]): PlannedDay[] | null {
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).join() !== "days"
    || !Array.isArray(value.days) || value.days.length !== count) return null;
  const available = new Map(catalog.map(place => [place.spotId, place]));
  const used = new Set<string>();
  const days: PlannedDay[] = [];
  for (const [index, day] of value.days.entries()) {
    if (!day || typeof day !== "object" || Array.isArray(day) || Object.keys(day).some(key => !["day", "spotIds"].includes(key))
      || day.day !== index + 1 || !Array.isArray(day.spotIds) || day.spotIds.length < 1 || day.spotIds.length > 4) return null;
    const activities: CatalogActivity[] = [];
    for (const id of day.spotIds) {
      if (typeof id !== "string" || used.has(id) || !available.has(id)) return null;
      used.add(id);
      activities.push(available.get(id)!);
    }
    days.push({ day: index + 1, activities });
  }
  return days;
}

export async function generateAIPlan(env: Env, ownerId: string, city: string, dayCount: number, preferences: string, catalog: CatalogActivity[]) {
  const key = "OPENAI_API_KEY" in env && typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY : "";
  const model = "OPENAI_CHAT_MODEL" in env ? env.OPENAI_CHAT_MODEL : LUNA_MODEL;
  if (!key || model !== LUNA_MODEL) return { error: "AI generation unavailable", status: 503 } as const;
  const facts = JSON.stringify(catalog);
  if (catalog.length < dayCount || facts.length > 16000) return { error: "Insufficient catalog coverage for this plan", status: 422 } as const;
  const reservation = await reserveAIRequest(env.DB, ownerId, "itinerary");
  if (!reservation) return { error: "Daily AI request limit reached", status: 429 } as const;
  const result = await lunaRequest(key, LUNA_MODEL, JSON.stringify({ city, days: dayCount, preferences }), facts, "itinerary");
  const days = result.text ? validateAIPlan(result.text, dayCount, catalog) : null;
  // Keep usage even when the provider truncates output or supplies an invalid plan.
  await settleAIRequest(env.DB, reservation, ownerId, days !== null, result.receipt);
  return days ? { days } : { error: "AI could not produce a valid catalog plan", status: 502 } as const;
}
