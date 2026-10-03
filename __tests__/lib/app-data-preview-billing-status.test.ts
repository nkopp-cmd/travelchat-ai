import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));

import { isPreviewBillingStatusCandidate, previewBillingStatus } from "@/lib/app-data/preview-billing-status";

const originalEnvironment = process.env;
const now = new Date("2026-09-29T12:00:00.000Z");
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

function setup(subscription: unknown[] = [], usage: unknown[] = [], saved = 0) {
  const all = vi.fn().mockResolvedValueOnce({ results: subscription }).mockResolvedValueOnce({ results: usage });
  const first = vi.fn().mockResolvedValue({ n: saved });
  const bind = vi.fn().mockReturnValue({ all, first });
  const prepare = vi.fn().mockReturnValue({ bind });
  mocks.reader.mockReturnValue({ prepare });
  return { prepare, bind };
}

describe("preview billing status repository", () => {
  it("selects only the exact owner and preserves paid response fields", async () => {
    process.env = { ...originalEnvironment, BETA_MODE: "false" };
    const { prepare, bind } = setup([{
      tier: "pro", status: "active", stripeCustomerId: "cus_test", currentPeriodEnd: "2026-10-29T00:00:00Z",
      cancelAtPeriodEnd: 1, trialEnd: null,
    }], [
      { usageType: "itineraries_created", periodType: "monthly", periodStart: "2026-09-01", count: 2 },
      { usageType: "chat_messages", periodType: "daily", periodStart: "2026-09-29", count: 3 },
      { usageType: "stories_created", periodType: "weekly", periodStart: "2026-09-28", count: 4 },
      { usageType: "ai_images_generated", periodType: "monthly", periodStart: "2026-09-01", count: 5 },
    ], 6);
    const result = await previewBillingStatus("owner-id", "ordinary@example.test", now);
    expect(result).toMatchObject({ tier: "pro", status: "active", isActive: true, hasBillingPortal: true,
      currentPeriodEnd: "2026-10-29T00:00:00Z", cancelAtPeriodEnd: true,
      usage: { itinerariesThisMonth: 2, chatMessagesToday: 3, storiesThisWeek: 4,
        aiImagesThisMonth: 5, savedSpots: 6 } });
    expect(result.limits).toHaveProperty("storiesPerWeek");
    expect(prepare.mock.calls.every(([sql]: [string]) => sql.includes("o.clerkUserId = ?"))).toBe(true);
    expect(bind.mock.calls[1]).toEqual(["owner-id", "auth:owner-id", "2026-09-01", "2026-09-29", "2026-09-28"]);
  });

  it("returns the free default and retains lifetime and beta priority", async () => {
    process.env = { ...originalEnvironment, BETA_MODE: "false" };
    setup();
    expect(await previewBillingStatus("owner-id", null, now)).toMatchObject({
      tier: "free", status: "none", isActive: false,
      usage: { chatMessagesToday: 0, savedSpots: 0 },
    });
    setup([{ tier: "pro", status: "canceled" }]);
    expect(await previewBillingStatus("owner-id", "hello@localley.io", now)).toMatchObject({
      tier: "premium", status: "lifetime_premium", isActive: true,
    });
    process.env = { ...originalEnvironment, BETA_MODE: "true" };
    setup([{ tier: "free", status: "active" }]);
    expect(await previewBillingStatus("owner-id", null, now)).toMatchObject({
      tier: "premium", status: "beta", isActive: true,
    });
  });

  it("fails closed on duplicate or malformed imported records", async () => {
    process.env = { ...originalEnvironment, BETA_MODE: "false" };
    setup([{ tier: "pro" }, { tier: "premium" }]);
    await expect(previewBillingStatus("owner-id", null, now)).rejects.toThrow("unavailable");
    setup([{ tier: "unknown" }]);
    await expect(previewBillingStatus("owner-id", null, now)).rejects.toThrow("tier");
    setup([], [{ usageType: "chat_messages", periodType: "daily", count: -1 }]);
    await expect(previewBillingStatus("owner-id", null, now)).rejects.toThrow("usage");
  });

  it("requires the exact preview host, flag, and isolation settings", () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, query = "?data_candidate=d1") =>
      new NextRequest(`https://${host}/api/subscription/status${query}`);
    expect(isPreviewBillingStatusCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewBillingStatusCandidate(request("www.localley.io"))).toBe(false);
    expect(isPreviewBillingStatusCandidate(request("localley-next-preview.nkopp.workers.dev", ""))).toBe(false);
    process.env = { ...process.env, AUTH_MAIL_MODE: "send" };
    expect(isPreviewBillingStatusCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });
});
