import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkAndIncrementUsageWeighted } from "@/lib/usage-tracking";
import { TIER_CONFIGS } from "@/lib/subscription";

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    from: vi.fn(),
    createAdmin: vi.fn(),
    getTier: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.createAdmin }));
// getUserTier is local to the module, so replace its cached tier lookup.
vi.mock("next/cache", () => ({ unstable_cache: () => mocks.getTier }));
vi.mock("@/lib/early-adopters", () => ({
    isBetaMode: vi.fn(),
    isEarlyAdopter: vi.fn(),
}));

describe("checkAndIncrementUsageWeighted", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.getTier.mockResolvedValue("premium");
        mocks.createAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    });

    it.each([1, 2, 3, 7])("sends exactly %i credits in one weighted RPC", async (amount) => {
        const count = 10 + amount;
        mocks.rpc.mockResolvedValue({
            data: [{ allowed: true, new_count: count, was_at_limit: false }],
            error: null,
        });

        const result = await checkAndIncrementUsageWeighted("user-1", "ai_images_generated", amount);
        const limit = TIER_CONFIGS.premium.limits.aiImagesPerMonth;

        expect(mocks.getTier).toHaveBeenCalledOnce();
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("check_and_increment_usage_weighted", {
            p_clerk_user_id: "user-1",
            p_usage_type: "ai_images_generated",
            p_period_type: "monthly",
            p_limit: limit,
            p_amount: amount,
        });
        expect(mocks.from).not.toHaveBeenCalled();
        expect(result).toEqual({
            allowed: true,
            tier: "premium",
            usage: {
                allowed: true,
                currentUsage: count,
                limit,
                remaining: limit - count,
                periodType: "monthly",
                periodResetAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            },
        });
    });

    it("preserves the default weight and quota denial with an object response", async () => {
        mocks.getTier.mockResolvedValue("pro");
        const limit = TIER_CONFIGS.pro.limits.aiImagesPerMonth;
        mocks.rpc.mockResolvedValue({
            data: { allowed: false, new_count: limit, was_at_limit: true },
            error: null,
        });

        const result = await checkAndIncrementUsageWeighted("user-1", "ai_images_generated");

        expect(mocks.rpc).toHaveBeenCalledWith("check_and_increment_usage_weighted",
            expect.objectContaining({ p_amount: 1, p_limit: limit }));
        expect(result).toMatchObject({
            allowed: false,
            tier: "pro",
            usage: { allowed: false, currentUsage: limit, remaining: 0 },
        });
    });

    it.each(["PGRST202", "42501", "XX000"])("throws on %s without a single-credit fallback", async (code) => {
        const cause = { code, message: "RPC failed" };
        mocks.rpc.mockResolvedValue({ data: null, error: cause });

        await expect(checkAndIncrementUsageWeighted("user-1", "ai_images_generated", 3))
            .rejects.toMatchObject({ message: "Usage tracking unavailable", cause });
        expect(mocks.rpc).toHaveBeenCalledOnce();
        expect(mocks.rpc.mock.calls[0][0]).toBe("check_and_increment_usage_weighted");
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it.each(["rpc", "createAdmin", "getTier"] as const)("wraps thrown %s errors without allowing usage", async (source) => {
        const cause = new Error("Unavailable dependency");
        mocks[source].mockImplementation(() => { throw cause; });

        await expect(checkAndIncrementUsageWeighted("user-1", "ai_images_generated", 2))
            .rejects.toMatchObject({ message: "Usage tracking unavailable", cause });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it("wraps rejected RPC promises without retrying", async () => {
        const cause = new Error("Network failure");
        mocks.rpc.mockRejectedValue(cause);
        await expect(checkAndIncrementUsageWeighted("user-1", "ai_images_generated", 3))
            .rejects.toMatchObject({ message: "Usage tracking unavailable", cause });
        expect(mocks.rpc).toHaveBeenCalledOnce();
    });

    it.each([0.5, -1, 0, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
        "rejects invalid weight %s before tier lookup or database access", async (amount) => {
            await expect(checkAndIncrementUsageWeighted("user-1", "ai_images_generated", amount))
                .rejects.toThrow(RangeError);
            expect(mocks.getTier).not.toHaveBeenCalled();
            expect(mocks.createAdmin).not.toHaveBeenCalled();
            expect(mocks.rpc).not.toHaveBeenCalled();
        },
    );

    it.each([null, [], {}, { allowed: "true", new_count: 3 }, { allowed: true },
        { allowed: true, new_count: -1 }, { allowed: true, new_count: NaN }])(
        "rejects malformed RPC data %j", async (data) => {
            mocks.rpc.mockResolvedValue({ data, error: null });
            await expect(checkAndIncrementUsageWeighted("user-1", "ai_images_generated", 3))
                .rejects.toThrow("Usage tracking unavailable");
            expect(mocks.rpc).toHaveBeenCalledOnce();
        },
    );
});
