// Push BL1: the free-plan cache key must ignore interest order/case/duplicates and change with every other input;
// a stored value of the wrong shape must read as a miss, never as a broken plan.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { planCacheKey, readCachedPlan, writeCachedPlan, PLAN_CACHE_TTL_SECONDS } from "@/lib/trips/plan-cache";
import type { DraftKv } from "@/lib/trips/preview-draft-store";

const memoryKv = () => {
  const store = new Map<string, string>();
  const puts: Array<{ key: string; ttl?: number }> = [];
  const kv: DraftKv = {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value, options) => { store.set(key, value); puts.push({ key, ttl: options?.expirationTtl }); },
    delete: async (key) => { store.delete(key); },
  };
  return { kv, store, puts };
};

const base = { city: "Seoul", days: 2, interests: ["food", "markets"], budget: "moderate", pace: "moderate" };

describe("planCacheKey", () => {
  it("ignores interest order, case, duplicates and city case", async () => {
    const a = await planCacheKey(base);
    const b = await planCacheKey({ ...base, city: " seoul ", interests: ["Markets", "food", "FOOD"] });
    expect(a).toBe(b);
    expect(a).toMatch(/^plan:v1:[0-9a-f]{64}$/);
  });

  it("changes with any other planner input", async () => {
    const a = await planCacheKey(base);
    const variants = [
      { ...base, city: "Tokyo" }, { ...base, days: 3 }, { ...base, interests: ["food"] }, { ...base, budget: "luxury" },
      { ...base, pace: "packed" }, { ...base, localnessLevel: 5 }, { ...base, groupType: "family" },
      { ...base, templatePrompt: "Coffee crawl" }, { ...base, spotId: "3f2b8c4e-9a1d-4c6e-8b7a-1d2e3f4a5b6c" },
    ];
    const keys = await Promise.all(variants.map((v) => planCacheKey(v)));
    expect(new Set([a, ...keys]).size).toBe(variants.length + 1);
  });
});

describe("readCachedPlan / writeCachedPlan", () => {
  const plan = { itineraryData: { title: "Seoul", dailyPlans: [{ day: 1 }, { day: 2 }] }, provider: "glm" as const, model: "glm-5.2" };

  it("round-trips a plan with a 24 h TTL", async () => {
    const { kv, puts } = memoryKv();
    await writeCachedPlan("plan:v1:x", plan, kv);
    expect(puts).toEqual([{ key: "plan:v1:x", ttl: PLAN_CACHE_TTL_SECONDS }]);
    expect(PLAN_CACHE_TTL_SECONDS).toBe(86_400);
    expect(await readCachedPlan("plan:v1:x", 2, kv)).toEqual(plan);
  });

  it("reads a wrong shape, a wrong day count or bad JSON as a miss", async () => {
    const { kv, store } = memoryKv();
    store.set("days", JSON.stringify(plan));
    store.set("shape", JSON.stringify({ itineraryData: { dailyPlans: [] }, provider: "glm" }));
    store.set("json", "{not json");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readCachedPlan("days", 3, kv)).toBeNull();
    expect(await readCachedPlan("shape", 0, kv)).toBeNull();
    expect(await readCachedPlan("json", 2, kv)).toBeNull();
    expect(await readCachedPlan("missing", 2, kv)).toBeNull();
    error.mockRestore();
  });

  it("does nothing without KV and survives KV errors", async () => {
    expect(await readCachedPlan("k", 2, null)).toBeNull();
    await writeCachedPlan("k", plan, null);
    const broken: DraftKv = {
      get: async () => { throw new Error("down"); },
      put: async () => { throw new Error("down"); },
      delete: async () => {},
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readCachedPlan("k", 2, broken)).toBeNull();
    await expect(writeCachedPlan("k", plan, broken)).resolves.toBeUndefined();
    error.mockRestore();
  });
});
