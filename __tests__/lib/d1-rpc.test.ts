// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown, supabaseRpc: vi.fn() }));
vi.mock("@/lib/app-data/backend", async (original) => ({
  ...(await original<typeof import("@/lib/app-data/backend")>()), appDataDb: () => mocks.db,
}));
vi.mock("@/lib/supabase", async () => {
  const { withMigratedTables } = await import("@/lib/app-data/hybrid-client");
  return { createSupabaseAdmin: () => withMigratedTables({ rpc: mocks.supabaseRpc, from: vi.fn() }, { role: "service" }), createSupabaseClient: vi.fn() };
});
import { d1Rpc, periodStart } from "@/lib/app-data/d1-rpc";
import { atomicCheckAndIncrement, incrementUsage } from "@/lib/usage-tracking";

let db: D1Sqlite;
beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "d1");
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  mocks.db = db;
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const reserve = (amount: number, limit = 3) => d1Rpc(db as never, "check_and_increment_usage_weighted",
  { p_clerk_user_id: "u1", p_usage_type: "ai_images_generated", p_period_type: "monthly", p_limit: limit, p_amount: amount });

describe("D1 usage functions", () => {
  it("period start matches Postgres CURRENT_DATE truncation (UTC)", () => {
    const at = new Date("2026-10-24T23:30:00Z"); // a Saturday
    expect([periodStart("daily", at), periodStart("weekly", at), periodStart("monthly", at)]).toEqual(["2026-10-24", "2026-10-19", "2026-10-01"]);
    expect(periodStart("weekly", new Date("2026-10-19T00:00:00Z"))).toBe("2026-10-19");
  });

  it("weighted reservation never passes the limit and does not write when denied", async () => {
    expect((await reserve(2)).data).toEqual([{ allowed: true, new_count: 2, was_at_limit: false }]);
    expect((await reserve(2)).data).toEqual([{ allowed: false, new_count: 2, was_at_limit: false }]);
    expect((await reserve(1)).data).toEqual([{ allowed: true, new_count: 3, was_at_limit: false }]);
    expect((await reserve(1)).data).toEqual([{ allowed: false, new_count: 3, was_at_limit: true }]);
    expect((await reserve(1, 0)).data).toEqual([{ allowed: false, new_count: 3, was_at_limit: true }]);
    expect(db.sqlite.prepare("SELECT count(*) AS n, max(count) AS c FROM legacy_usage").get()).toEqual({ n: 1, c: 3 });
  });

  it("a first reservation above the limit writes nothing", async () => {
    expect((await reserve(5, 3)).data).toEqual([{ allowed: false, new_count: 0, was_at_limit: false }]);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM legacy_usage").get()).toEqual({ n: 0 });
  });

  it("CHECK constraints of usage_tracking apply (23514)", async () => {
    const bad = await d1Rpc(db as never, "increment_usage", { p_clerk_user_id: "u1", p_usage_type: "bogus" });
    expect(bad.error?.code).toBe("23514");
  });

  it("lib/usage-tracking runs unchanged on D1 through the hybrid admin client", async () => {
    expect(await atomicCheckAndIncrement("u2", "chat_messages", 2)).toMatchObject({ allowed: true, newCount: 1 });
    expect(await atomicCheckAndIncrement("u2", "chat_messages", 2)).toMatchObject({ allowed: true, newCount: 2 });
    expect(await atomicCheckAndIncrement("u2", "chat_messages", 2)).toMatchObject({ allowed: false, newCount: 2 });
    expect(await incrementUsage("u3", "itineraries_created")).toEqual({ success: true, newCount: 1 });
    expect(await incrementUsage("u3", "itineraries_created")).toEqual({ success: true, newCount: 2 });
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });
});
