import { z } from "zod";
export const GENERATED_PREVIEW_KEY = "localley.generated-preview.v1";
export const GENERATED_PREVIEW_PATH = "/itineraries/preview";
const MAX_BYTES = 512_000;
const plan = z.object({
  title: z.string().min(1).max(200), city: z.string().min(1).max(100), days: z.number().int().min(1).max(14),
  dailyPlans: z.array(z.object({ day: z.number().int().min(1).max(14), theme: z.string().max(500).optional(),
    activities: z.array(z.object({ name: z.string().min(1).max(300), time: z.string().max(100).optional(), description: z.string().max(5000).optional() }).passthrough()).max(30),
  }).passthrough()).min(1).max(14),
  insights: z.array(z.unknown()).max(50).optional(), localScore: z.number().optional(),
}).passthrough();
const draft = z.object({ version: z.literal(1), id: z.string().uuid(), createdAt: z.number().finite(), itinerary: plan });
export type GeneratedPreview = z.infer<typeof draft>;
export function parseGeneratedPreview(raw: string | null, now = Date.now()): GeneratedPreview | null {
  if (!raw || new TextEncoder().encode(raw).length > MAX_BYTES) return null;
  try { const value = draft.parse(JSON.parse(raw)); return value.createdAt <= now && now - value.createdAt < 86_400_000 ? value : null; } catch { return null; }
}
export function storeGeneratedPreview(storage: Pick<Storage, "setItem">, itinerary: unknown, now = Date.now(), id = crypto.randomUUID()) {
  const value = draft.parse({ version: 1, id, createdAt: now, itinerary });
  const raw = JSON.stringify(value); if (new TextEncoder().encode(raw).length > MAX_BYTES) throw new Error("The itinerary is too large to keep in this browser.");
  storage.setItem(GENERATED_PREVIEW_KEY, raw); return value;
}
