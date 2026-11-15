import { describe, expect, it, vi } from "vitest";
import { DRAFT_TTL_SECONDS, dropServerDraft, isDraftId, keepServerDraft, readServerDraft, type DraftKv } from "@/lib/trips/preview-draft-store";

const plan = { title: "Seoul afternoon", city: "Seoul", days: 1, dailyPlans: [{ day: 1, activities: [{ name: "Market walk" }] }] };
function memoryKv() {
  const rows = new Map<string, { value: string; ttl: number }>();
  const kv: DraftKv = {
    get: async key => rows.get(key)?.value ?? null,
    put: async (key, value, { expirationTtl }) => { rows.set(key, { value, ttl: expirationTtl }); },
    delete: async key => { rows.delete(key); },
  };
  return { kv, rows };
}

describe("server-held preview draft", () => {
  it("keeps a checked draft for 24 h under a random v4 id and reads it back", async () => {
    const { kv, rows } = memoryKv();
    const kept = await keepServerDraft(plan, kv, 1_000);
    expect(kept && isDraftId(kept.id)).toBe(true);
    expect([...rows.values()][0].ttl).toBe(DRAFT_TTL_SECONDS);
    expect(await readServerDraft(kept!.id, kv, 2_000)).toEqual(kept);
  });
  it("refuses a bad plan, a bad id, an expired draft and a draft stored under another id", async () => {
    const { kv, rows } = memoryKv();
    expect(await keepServerDraft({ ...plan, dailyPlans: [] }, kv)).toBeNull();
    expect(rows.size).toBe(0);
    const kept = (await keepServerDraft(plan, kv, 1_000))!;
    expect(await readServerDraft("../x", kv)).toBeNull();
    expect(await readServerDraft(kept.id, kv, 1_000 + 86_400_000)).toBeNull();
    const other = "550e8400-e29b-41d4-a716-446655440000";
    rows.set(`draft:${other}`, rows.get(`draft:${kept.id}`)!);
    expect(await readServerDraft(other, kv, 2_000)).toBeNull();
  });
  it("still returns the draft when KV is missing or fails, and drops it on save", async () => {
    expect(await keepServerDraft(plan, null)).not.toBeNull();
    const failing: DraftKv = { get: async () => { throw Error("down"); }, put: async () => { throw Error("down"); }, delete: async () => { throw Error("down"); } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const kept = (await keepServerDraft(plan, failing))!;
    expect(await readServerDraft(kept.id, failing)).toBeNull();
    await expect(dropServerDraft(kept.id, failing)).resolves.toBeUndefined();
    const { kv, rows } = memoryKv();
    const live = (await keepServerDraft(plan, kv))!;
    await dropServerDraft(live.id, kv);
    expect(rows.size).toBe(0);
  });
});
