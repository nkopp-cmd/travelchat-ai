// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), eq: vi.fn(), single: vi.fn(), tier: "free" }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ rpc: m.rpc, from: m.from }) }));
vi.mock("@/lib/early-adopters", () => ({ isBetaMode: () => false, isEarlyAdopter: async () => false }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn, revalidateTag: vi.fn() }));
import { atomicCheckAndIncrement, checkAndIncrementUsage, checkAndIncrementUsageWeighted, checkUsageLimit } from "@/lib/usage-tracking";
import { TIER_CONFIGS } from "@/lib/subscription";
const denied = { allowed: false, newCount: 0, wasAtLimit: true };
const row = { allowed: true, new_count: 1, was_at_limit: false };
beforeEach(() => {
    vi.clearAllMocks(); m.tier = "free";
    m.rpc.mockResolvedValue({ data: [row], error: null });
    m.from.mockImplementation((table: string) => {
        const q = { select: vi.fn(), eq: m.eq, single: vi.fn() };
        q.select.mockReturnValue(q); m.eq.mockReturnValue(q);
        q.single.mockImplementation(() => table === "subscriptions"
            ? Promise.resolve({ data: { tier: m.tier, status: "active" } })
            : table === "users" ? Promise.resolve({ data: { email: "ordinary@preview.localley.test" } })
                : Promise.resolve({ data: { count: 1 } }));
        return q;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("atomic usage reservations", () => {
    it.each([["chat_messages", "daily"], ["stories_created", "weekly"], ["itineraries_created", "monthly"]] as const)("reserves one %s unit in the existing atomic function", async (type, period) => {
        expect(await atomicCheckAndIncrement("owned", type, 10)).toEqual({ allowed: true, newCount: 1, wasAtLimit: false });
        expect(m.rpc).toHaveBeenCalledExactlyOnceWith("check_and_increment_usage_weighted", { p_clerk_user_id: "owned", p_usage_type: type, p_period_type: period, p_limit: 10, p_amount: 1 });
        expect(m.from).not.toHaveBeenCalled();
    });
    it("preserves the counter returned at the cap without another write", async () => {
        m.rpc.mockResolvedValue({ data: [{ allowed: false, new_count: 10, was_at_limit: true }], error: null });
        expect(await atomicCheckAndIncrement("owned", "chat_messages", 10)).toEqual({ allowed: false, newCount: 10, wasAtLimit: true });
        expect(m.rpc).toHaveBeenCalledTimes(1); expect(m.from).not.toHaveBeenCalled();
    });
    it.each(["PGRST202", "42501", "fetch_failed"])("denies %s without a separate read/increment/upsert fallback", async code => {
        m.rpc.mockResolvedValue({ data: null, error: { code } });
        expect(await atomicCheckAndIncrement("owned", "chat_messages", 10)).toEqual(denied);
        expect(m.rpc).toHaveBeenCalledTimes(1); expect(m.from).not.toHaveBeenCalled();
    });
    it.each([null, [], [row, row], [{ ...row, allowed: "true" }], [{ ...row, new_count: -1 }], [{ ...row, new_count: 1.5 }], [{ ...row, new_count: "1" }], [{ ...row, was_at_limit: null }], [{ ...row, new_count: 11 }], [{ ...row, was_at_limit: true }]])("denies malformed results without retry: %j", async data => {
        m.rpc.mockResolvedValue({ data, error: null });
        expect(await atomicCheckAndIncrement("owned", "chat_messages", 10)).toEqual(denied);
        expect(m.rpc).toHaveBeenCalledTimes(1); expect(m.from).not.toHaveBeenCalled();
    });
    it.each([Infinity, NaN, -1, 2.5, 2_147_483_648])("rejects an invalid SQL limit %s before an RPC", async limit => {
        expect(await atomicCheckAndIncrement("owned", "chat_messages", limit)).toEqual(denied); expect(m.rpc).not.toHaveBeenCalled();
    });
    it("preserves every current tier limit as a finite nonnegative SQL integer", () => {
        for (const tier of Object.values(TIER_CONFIGS)) for (const key of ["itinerariesPerMonth", "chatMessagesPerDay", "storiesPerWeek", "aiImagesPerMonth", "savedSpotsLimit"] as const) {
            expect(Number.isSafeInteger(tier.limits[key])).toBe(true); expect(tier.limits[key]).toBeGreaterThanOrEqual(0); expect(tier.limits[key]).toBeLessThanOrEqual(2_147_483_647);
        }
    });
    it("keeps the normal free chat allowance and displayed remaining count", async () => {
        const result = await checkAndIncrementUsage("owned", "chat_messages");
        expect(result).toMatchObject({ allowed: true, tier: "free", usage: { currentUsage: 1, limit: 10, remaining: 9, periodType: "daily" } });
        expect(m.rpc).toHaveBeenCalledTimes(1);
    });
    it("preserves a weighted credit amount without downgrading it", async () => {
        m.tier = "premium"; m.rpc.mockResolvedValue({ data: [{ ...row, new_count: 3 }], error: null });
        expect(await checkAndIncrementUsageWeighted("owned", "ai_images_generated", 3)).toMatchObject({ allowed: true, usage: { currentUsage: 3, limit: 200, remaining: 197 } });
        expect(m.rpc).toHaveBeenCalledExactlyOnceWith("check_and_increment_usage_weighted", expect.objectContaining({ p_amount: 3, p_limit: 200, p_period_type: "monthly" }));
    });
    it("denies a missing weighted function instead of charging one credit", async () => {
        m.tier = "premium"; m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
        expect(await checkAndIncrementUsageWeighted("owned", "ai_images_generated", 3)).toMatchObject({ allowed: false });
        expect(m.rpc).toHaveBeenCalledTimes(1); expect(m.from.mock.calls.map(c => c[0])).not.toContain("usage_tracking");
    });
    it.each([0, -1, 0.5, NaN, Infinity, 2_147_483_648])("refuses invalid weighted credits %s before a reservation", async amount => {
        expect(await checkAndIncrementUsageWeighted("owned", "ai_images_generated", amount)).toMatchObject({ allowed: false }); expect(m.rpc).not.toHaveBeenCalled();
    });
    it.each([
        ["chat_messages", "2026-02-01T23:59:59Z", "2026-02-01", "2026-02-02"],
        ["stories_created", "2026-02-01T23:59:59Z", "2026-01-26", "2026-02-02"],
        ["stories_created", "2026-02-02T00:00:00Z", "2026-02-02", "2026-02-09"],
        ["itineraries_created", "2026-01-31T23:59:59Z", "2026-01-01", "2026-02-01"],
        ["itineraries_created", "2026-02-01T00:00:00Z", "2026-02-01", "2026-03-01"],
    ] as const)("matches UTC SQL period boundaries: %s at %s", async (type, now, start, reset) => {
        vi.stubEnv("TZ", "UTC"); vi.useFakeTimers(); vi.setSystemTime(new Date(now));
        const result = await checkUsageLimit("owned", type, "free");
        expect(m.eq).toHaveBeenCalledWith("period_start", start); expect(result.periodResetAt).toBe(reset);
    });
});
