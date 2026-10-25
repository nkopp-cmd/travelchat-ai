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

describe("D1 social/engagement functions and generated-table triggers", () => {
  const sub = "30000000-0000-4000-8000-000000000001", contributor = "30000000-0000-4000-8000-000000000002";
  const spot = "30000000-0000-4000-8000-000000000003";
  beforeEach(() => {
    db.sqlite.exec(`INSERT INTO spot_contributors (id, email, public_credit_name, total_tokens) VALUES ('${contributor}', 'c@x.test', 'C', 5);
      INSERT INTO social_spot_submissions (id, contributor_id, source_url, canonical_url, platform, status, contributor_credit, media_processing_revision, media_finalization_attempt_count)
        VALUES ('${sub}', '${contributor}', 'u', 'u', 'instagram', 'spot_created', 'C', 1, 3);
      INSERT INTO spots (id, name, description, category, visible) VALUES ('${spot}', '{"en":"S"}', '{"en":"d"}', 'Cafe', 1);`);
  });

  it("award tokens once per submission; second call awards 0; mismatches raise P0001", async () => {
    const award = () => d1Rpc(db as never, "award_social_submission_tokens_v1", { p_submission_id: sub, p_contributor_id: contributor, p_delta: 10 });
    expect((await award()).data).toEqual([{ awarded: 10, total_tokens: 15 }]);
    expect((await award()).data).toEqual([{ awarded: 0, total_tokens: 15 }]);
    expect(db.sqlite.prepare("SELECT token_awarded FROM social_spot_submissions").get()).toEqual({ token_awarded: 10 });
    expect((await d1Rpc(db as never, "award_social_submission_tokens_v1", { p_submission_id: sub, p_contributor_id: spot, p_delta: 1 })).error)
      .toMatchObject({ code: "P0001", message: "Submission and contributor do not match" });
    expect((await d1Rpc(db as never, "award_social_submission_tokens_v1", { p_submission_id: sub, p_contributor_id: contributor, p_delta: 0 })).error?.code).toBe("P0001");
  });

  it("replace weekly rankings swaps the whole week/city set", async () => {
    const replace = (ranks: number[]) => d1Rpc(db as never, "replace_weekly_city_spot_rankings", { p_week_start: "2026-10-19", p_city_slug: "seoul",
      p_rankings: ranks.map((rank) => ({ spot_id: spot, rank, score: 50, post_count: 2, platform_count: 1, signal_summary: { tiktok: 2 } })) });
    expect((await replace([1])).data).toBe(1);
    expect((await replace([2])).data).toBe(1);
    expect(db.sqlite.prepare("SELECT rank, signal_summary FROM weekly_city_spot_rankings").all().map((r) => ({ ...r }))).toEqual([{ rank: 2, signal_summary: '{"tiktok":2}' }]);
    expect((await replace([9])).error?.code).toBe("23514");
  });

  it("content engagement: paid viewers only, no self views, one per day", async () => {
    const track = (viewer: string, tier: string) => d1Rpc(db as never, "track_content_engagement",
      { p_viewer_clerk_user_id: viewer, p_viewer_tier: tier, p_content_type: "itinerary_save", p_content_id: "i1", p_creator_clerk_user_id: "creator" });
    expect((await track("v1", "free")).data).toBe(false);
    expect((await track("creator", "pro")).data).toBe(false);
    expect((await track("v1", "pro")).data).toBe(true);
    expect((await track("v1", "pro")).data).toBe(true);
    expect(db.sqlite.prepare("SELECT count(*) AS n, max(engagement_points) AS p FROM content_engagement").get()).toEqual({ n: 1, p: 3 });
  });

  it("social_spot_submissions update triggers: updated_at and the media finalization reset on a new revision", async () => {
    const { d1Client } = await import("@/lib/app-data/d1-postgrest");
    const service = d1Client(db as never, { role: "service" });
    await service.from("social_spot_submissions").update({ status: "needs_review" }).eq("id", sub);
    expect(db.sqlite.prepare("SELECT media_finalization_attempt_count AS c FROM social_spot_submissions").get()).toEqual({ c: 3 });
    await service.from("social_spot_submissions").update({ media_processing_revision: 2 }).eq("id", sub);
    const row = db.sqlite.prepare("SELECT media_finalization_attempt_count AS c, updated_at FROM social_spot_submissions").get() as { c: number; updated_at: string };
    expect(row.c).toBe(0);
    expect(row.updated_at).toMatch(/\+00:00$/);
  });
});

describe("D1 functions write the gate 2 journal", () => {
  it("usage reservations journal their conflict key", async () => {
    await d1Rpc(db as never, "check_and_increment_usage_weighted", { p_clerk_user_id: "u9", p_usage_type: "chat_messages", p_period_type: "daily", p_limit: 5, p_amount: 1 });
    const row = db.sqlite.prepare("SELECT table_name, pk FROM _journal").get() as { table_name: string; pk: string };
    expect(row.table_name).toBe("usage_tracking");
    expect(JSON.parse(row.pk)).toMatchObject({ clerk_user_id: "u9", usage_type: "chat_messages", period_type: "daily" });
  });
});
