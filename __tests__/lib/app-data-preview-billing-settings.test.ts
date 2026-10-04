// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIER_CONFIGS } from "@/lib/subscription";
const mocks = vi.hoisted(() => ({ user: vi.fn(), owners: vi.fn(), billing: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-conversations", () => ({ ownerIds: mocks.owners, newOwnerId: (id: string) => `auth:${id}` }));
vi.mock("@/lib/app-data/preview-billing-status", () => ({ previewBillingStatus: mocks.billing }));
import { previewBillingSettings } from "@/lib/app-data/preview-billing-settings";
const user = { id: "one", emailVerified: true, primaryEmailAddress: { emailAddress: "one@preview.localley.test" } };
const billing = { tier: "pro", status: "active", currentPeriodEnd: "2026-11-01T00:00:00.000Z", trialEnd: null,
  cancelAtPeriodEnd: false, limits: TIER_CONFIGS.pro.limits,
  usage: { itinerariesThisMonth: 2, chatMessagesToday: 3, storiesThisWeek: 4, aiImagesThisMonth: 6, savedSpots: 1 } };
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue(user); mocks.owners.mockResolvedValue({ fresh: "auth:one", legacy: null }); mocks.billing.mockResolvedValue(billing); });
afterEach(() => vi.restoreAllMocks());
describe("private billing settings reader", () => {
  it("reads only the verified fresh owner and preserves effective plan, period and all usage", async () => {
    const result = await previewBillingSettings("one");
    expect(mocks.billing).toHaveBeenCalledWith("one", "one@preview.localley.test");
    expect(result).toMatchObject({ plan: "Pro", status: "Active", periodEnd: "2026-11-01", cancelAtPeriodEnd: false });
    expect(result.usage.map(r => r.used)).toEqual([2, 3, 4, 6, 1]);
    expect(result.usage.every(r => r.percent >= 0 && r.percent <= 100)).toBe(true);
  });
  it.each([null, { ...user, id: "foreign" }, { ...user, emailVerified: false },
    { ...user, primaryEmailAddress: { emailAddress: "one@example.com" } }])("refuses missing, foreign, unverified and real mailboxes before billing reads", async value => {
    mocks.user.mockResolvedValue(value); await expect(previewBillingSettings("one")).rejects.toThrow("owner unavailable"); expect(mocks.billing).not.toHaveBeenCalled();
  });
  it.each([{ fresh: null, legacy: null }, { fresh: "auth:other", legacy: null }, { fresh: "auth:one", legacy: "legacy" }])("refuses absent, mismatched and historical owners", async value => {
    mocks.owners.mockResolvedValue(value); await expect(previewBillingSettings("one")).rejects.toThrow("owner unavailable"); expect(mocks.billing).not.toHaveBeenCalled();
  });
  it("propagates unavailable storage and refuses malformed status, date and usage", async () => {
    mocks.billing.mockRejectedValueOnce(new Error("D1 unavailable")); await expect(previewBillingSettings("one")).rejects.toThrow("D1 unavailable");
    for (const changed of [{ status: "private unexpected status" }, { currentPeriodEnd: "invalid" }, { usage: { ...billing.usage, chatMessagesToday: -1 } }]) {
      mocks.billing.mockResolvedValue({ ...billing, ...changed }); await expect(previewBillingSettings("one")).rejects.toThrow("unavailable");
    }
  });
  it("uses effective free limits after cancellation and caps over-limit bars", async () => {
    mocks.billing.mockResolvedValue({ ...billing, tier: "free", status: "canceled", currentPeriodEnd: null,
      limits: TIER_CONFIGS.free.limits, usage: { ...billing.usage, chatMessagesToday: 9999 } });
    const result = await previewBillingSettings("one"); expect(result.plan).toBe("No paid plan"); expect(result.status).toBe("Canceled"); expect(result.usage[1].percent).toBe(100);
  });
});
