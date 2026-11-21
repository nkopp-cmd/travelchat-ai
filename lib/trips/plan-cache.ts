import "server-only";
import { previewDraftKv, type DraftKv } from "./preview-draft-store";

/**
 * Push BL1: the anonymous/free single-city plan took 15.7 s (spot query + LLM) on 2026-11-21, and it is the one free
 * plan a visitor gets before Save/checkout. The same inputs (the "Free 3-day plan" preset, a template card) give the
 * same grounded plan, so keep the finished plan in KV `PREVIEW_DRAFTS` (no new binding) under `plan:v1:<sha256>` for
 * 24 h. The key covers every planner input; the plan holds public spot data only, never a user id.
 * Paid tiers are never cached (they get AI images and a saved row). No KV or any KV error -> plain generation.
 */
export const PLAN_CACHE_TTL_SECONDS = 86_400;
const KEY_PREFIX = "plan:v1:";

/**
 * Push BM1: real traffic is ~0, so almost every visitor is the FIRST one and missed the 24 h entry (14.5 s spinner).
 * The planner preset ("Free 3-day plan": wizard-context defaultData) is kept 8 d and counts as fresh for 7 d; the
 * agent-host job scripts/warm-free-plans.mjs requests it daily for the Ring-1 cities, so the plan is regenerated on
 * day 7 while the old one still serves (no gap), at 1 model call per city per 7 d.
 */
export const PRESET_PLAN_TTL_SECONDS = 8 * 86_400;
export const PRESET_PLAN_FRESH_MS = 7 * 86_400_000;
export const PLAN_PRESET = { days: 3, budget: "moderate", localnessLevel: 3, pace: "moderate", groupType: "solo" } as const;

/** True for the wizard's untouched "Free 3-day plan" inputs (any city): no interests, template or spot chosen. */
export function isPresetPlanInput(input: PlanCacheInput): boolean {
  return input.days === PLAN_PRESET.days
    && (input.interests ?? []).every((i) => !i.trim())
    && input.budget === PLAN_PRESET.budget
    && input.localnessLevel === PLAN_PRESET.localnessLevel
    && input.pace === PLAN_PRESET.pace
    && input.groupType === PLAN_PRESET.groupType
    && !input.templatePrompt?.trim()
    && !input.spotId;
}

export interface PlanCacheInput {
  city: string;
  days: number;
  interests?: readonly string[];
  budget?: string;
  localnessLevel?: number;
  pace?: string;
  groupType?: string;
  templatePrompt?: string;
  spotId?: string;
}

export interface CachedPlan {
  itineraryData: { title: string; dailyPlans: unknown[] } & Record<string, unknown>;
  provider: "glm" | "openai";
  model?: string;
  /** Epoch ms after which a read treats the entry as a miss (regenerate + rewrite). Absent on BL1-era entries. */
  freshUntil?: number;
}

/** Same inputs -> same key: interest order, case and duplicates do not matter; any other change gives a new key. */
export function normalizePlanCacheInput(input: PlanCacheInput): string {
  const interests = [...new Set((input.interests ?? []).map((i) => i.trim().toLowerCase()).filter(Boolean))].sort();
  return JSON.stringify([
    input.city.trim().toLowerCase(),
    input.days,
    interests,
    input.budget ?? null,
    input.localnessLevel ?? null,
    input.pace ?? null,
    input.groupType ?? null,
    input.templatePrompt?.trim() || null,
    input.spotId ?? null,
  ]);
}

export async function planCacheKey(input: PlanCacheInput): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizePlanCacheInput(input)));
  return KEY_PREFIX + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function isCachedPlan(value: unknown, days: number): value is CachedPlan {
  if (!value || typeof value !== "object") return false;
  const { itineraryData, provider } = value as Partial<CachedPlan>;
  return (provider === "glm" || provider === "openai")
    && !!itineraryData && typeof itineraryData === "object"
    && typeof itineraryData.title === "string"
    && Array.isArray(itineraryData.dailyPlans) && itineraryData.dailyPlans.length === days;
}

export async function readCachedPlan(
  key: string, days: number, kv: DraftKv | null = previewDraftKv(), now: number = Date.now(),
): Promise<CachedPlan | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isCachedPlan(parsed, days)) return null;
    return typeof parsed.freshUntil === "number" && now > parsed.freshUntil ? null : parsed;
  } catch {
    console.error("[plan-cache] KV read failed");
    return null;
  }
}

export async function writeCachedPlan(
  key: string, plan: CachedPlan, kv: DraftKv | null = previewDraftKv(), options: { preset?: boolean; now?: number } = {},
): Promise<void> {
  if (!kv) return;
  const now = options.now ?? Date.now();
  const ttl = options.preset ? PRESET_PLAN_TTL_SECONDS : PLAN_CACHE_TTL_SECONDS;
  const freshUntil = now + (options.preset ? PRESET_PLAN_FRESH_MS : PLAN_CACHE_TTL_SECONDS * 1000);
  try { await kv.put(key, JSON.stringify({ ...plan, freshUntil }), { expirationTtl: ttl }); }
  catch { console.error("[plan-cache] KV write failed"); }
}
