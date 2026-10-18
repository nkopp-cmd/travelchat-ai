import type { WizardData } from "@/components/itineraries/wizard/wizard-context";
import { tripEndDate } from "./date-range";

export const PLANNER_DRAFT_KEY = "localley:planner-inputs:v1";
export const PLANNER_RESUME_PATH = "/itineraries/new?resume=1";
export const PLANNER_DRAFT_TTL = 24 * 60 * 60 * 1000;
const MAX_BYTES = 16_384;

// This is input recovery only. Never store sessions, entitlements or generated trips here.
const fields = new Set([
  "city", "days", "budget", "interests", "localnessLevel", "pace", "groupType",
  "templatePrompt", "templateName", "tripMode", "citySlugs", "cityNameBySlug", "startDate",
]);
const slug = /^[a-z0-9-]{1,80}$/;
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number, min = 0): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function choice(value: unknown, options: string[]): value is string {
  return typeof value === "string" && options.includes(value);
}
function validInputs(value: unknown): value is WizardData {
  if (!record(value) || Object.keys(value).some(key => !fields.has(key))) return false;
  if (!text(value.city, 120) || !integer(value.days, 1, 21)
    || !choice(value.budget, ["cheap", "moderate", "splurge"])
    || !choice(value.pace, ["relaxed", "moderate", "active", "packed"])
    || !choice(value.groupType, ["solo", "couple", "friends", "family", "business"])
    || !integer(value.localnessLevel, 1, 5)) return false;
  if (!Array.isArray(value.interests) || value.interests.length > 10
    || !value.interests.every(item => text(item, 80, 1))) return false;
  if (!Array.isArray(value.citySlugs) || value.citySlugs.length > 5
    || !value.citySlugs.every(item => typeof item === "string" && slug.test(item))) return false;
  if (!record(value.cityNameBySlug) || Object.keys(value.cityNameBySlug).length > 5
    || !Object.entries(value.cityNameBySlug).every(([key, name]) => slug.test(key) && text(name, 120))) return false;
  if (value.templatePrompt !== undefined && !text(value.templatePrompt, 4096)) return false;
  if (value.templateName !== undefined && !text(value.templateName, 160)) return false;
  if (value.startDate !== undefined && (!text(value.startDate, 10) || !tripEndDate(value.startDate, value.days))) return false;
  return value.tripMode === "multi" ? value.citySlugs.length >= 2
    : value.tripMode === "single" && value.city.trim().length > 0 && value.days <= 7;
}

export function parsePlannerDraft(raw: string | null, now = Date.now()): { version: 1; savedAt: number; data: WizardData } | null {
  if (!raw || raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || Object.keys(value).length !== 3 || value.version !== 1
      || !integer(value.savedAt, 0, now) || now - value.savedAt >= PLANNER_DRAFT_TTL
      || !validInputs(value.data)) return null;
    return { version: 1, savedAt: value.savedAt, data: value.data };
  } catch { return null; }
}

export function savePlannerDraft(storage: Pick<Storage, "setItem">, data: WizardData, now = Date.now()) {
  const raw = JSON.stringify({ version: 1, savedAt: now, data });
  if (!parsePlannerDraft(raw, now)) throw new Error("Check your trip inputs before continuing.");
  try { storage.setItem(PLANNER_DRAFT_KEY, raw); }
  catch { throw new Error("Your browser could not keep your trip inputs. Enable site storage and try again."); }
}

export function plannerDraftSnapshot() {
  try { return window.localStorage.getItem(PLANNER_DRAFT_KEY); }
  catch { return null; }
}
export const plannerDraftServerSnapshot = () => null;
export function subscribePlannerDraft(onChange: () => void) {
  const listener = (event: StorageEvent) => {
    if (event.key === PLANNER_DRAFT_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
