// Hand-written checks instead of zod: this module ships on the planner and preview pages, and zod added 31 KB gzip
// to both. __tests__/lib/generated-preview-schema.test.ts proves the checks accept and return exactly what the old
// zod schema did.
export const GENERATED_PREVIEW_KEY = "localley.generated-preview.v1";
export const GENERATED_PREVIEW_PATH = "/itineraries/preview";
const MAX_BYTES = 512_000;

type Activity = { name: string; time?: string; description?: string; [key: string]: unknown };
type DailyPlan = { day: number; theme?: string; activities: Activity[]; [key: string]: unknown };
export type GeneratedPlan = { title: string; city: string; days: number; dailyPlans: DailyPlan[]; insights?: unknown[]; localScore?: number; [key: string]: unknown };
export type GeneratedPreview = { version: 1; id: string; createdAt: number; itinerary: GeneratedPlan };

const UUID = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, min: number, max: number) => typeof value === "string" && value.length >= min && value.length <= max;
const optionalText = (value: unknown, max: number) => value === undefined || text(value, 0, max);
const int = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const list = (value: unknown, min: number, max: number): value is unknown[] => Array.isArray(value) && value.length >= min && value.length <= max;

function isActivity(value: unknown): value is Activity {
  return isObject(value) && text(value.name, 1, 300) && optionalText(value.time, 100) && optionalText(value.description, 5000);
}
function isDailyPlan(value: unknown): value is DailyPlan {
  return isObject(value) && int(value.day, 1, 14) && optionalText(value.theme, 500) && list(value.activities, 0, 30) && value.activities.every(isActivity);
}
export function isGeneratedPlan(value: unknown): value is GeneratedPlan {
  return isObject(value) && text(value.title, 1, 200) && text(value.city, 1, 100) && int(value.days, 1, 14)
    && list(value.dailyPlans, 1, 14) && value.dailyPlans.every(isDailyPlan)
    && (value.insights === undefined || list(value.insights, 0, 50))
    && (value.localScore === undefined || (typeof value.localScore === "number" && Number.isFinite(value.localScore)));
}
// -> the draft with only its four known keys, or null.
export function checkGeneratedPreview(value: unknown): GeneratedPreview | null {
  if (!isObject(value) || value.version !== 1 || typeof value.id !== "string" || !UUID.test(value.id)) return null;
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) || !isGeneratedPlan(value.itinerary)) return null;
  return { version: 1, id: value.id, createdAt: value.createdAt, itinerary: value.itinerary };
}

export function parseGeneratedPreview(raw: string | null, now = Date.now()): GeneratedPreview | null {
  if (!raw || new TextEncoder().encode(raw).length > MAX_BYTES) return null;
  let value: GeneratedPreview | null;
  try { value = checkGeneratedPreview(JSON.parse(raw)); } catch { return null; }
  return value && value.createdAt <= now && now - value.createdAt < 86_400_000 ? value : null;
}
export function storeGeneratedPreview(storage: Pick<Storage, "setItem">, itinerary: unknown, now = Date.now(), id = crypto.randomUUID()) {
  const value = checkGeneratedPreview({ version: 1, id, createdAt: now, itinerary });
  if (!value) throw new Error("The itinerary could not be kept in this browser.");
  const raw = JSON.stringify(value); if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new Error("The itinerary is too large to keep in this browser.");
  storage.setItem(GENERATED_PREVIEW_KEY, raw); return value;
}

export function generatedPreviewSnapshot(): string | null {
  try { return localStorage.getItem(GENERATED_PREVIEW_KEY); } catch { return null; }
}
export function generatedPreviewServerSnapshot(): null { return null; }
export function subscribeGeneratedPreview(listener: () => void) {
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
