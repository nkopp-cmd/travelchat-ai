import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshWeeklySocialTrends: vi.fn(),
}));

vi.mock("@/lib/weekly-social-trends", () => ({
  refreshWeeklySocialTrends: mocks.refreshWeeklySocialTrends,
}));

function request(secret: string) {
  return new NextRequest("https://www.localley.io/api/cron/refresh-weekly-social-trends", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("weekly social trend cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    mocks.refreshWeeklySocialTrends.mockResolvedValue({
      weekStart: "2026-07-13",
      started: ["instagram", "tiktok", "youtube"],
      pending: [],
      processed: [],
      failed: [],
      contentItems: 0,
      rankings: 0,
      builtCities: [],
    });
  });

  it("rejects an invalid cron bearer without starting actors", async () => {
    const { GET } = await import("@/app/api/cron/refresh-weekly-social-trends/route");
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.refreshWeeklySocialTrends).not.toHaveBeenCalled();
  });

  it("returns only the sanitized refresh summary", async () => {
    const { GET } = await import("@/app/api/cron/refresh-weekly-social-trends/route");
    const response = await GET(request("cron-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      summary: expect.objectContaining({
        weekStart: "2026-07-13",
        started: ["instagram", "tiktok", "youtube"],
      }),
    });
    expect(JSON.stringify(body)).not.toContain("apify_");
  });
});
