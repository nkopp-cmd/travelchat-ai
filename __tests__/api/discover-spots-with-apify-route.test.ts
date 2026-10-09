import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refreshApifySpotDiscovery: vi.fn(), collectActiveApifySpotDiscovery: vi.fn() }));

vi.mock("@/lib/apify-spot-discovery", () => ({
  refreshApifySpotDiscovery: mocks.refreshApifySpotDiscovery,
  collectActiveApifySpotDiscovery: mocks.collectActiveApifySpotDiscovery,
}));

function request(secret: string, query = "") {
  return new NextRequest("https://localley.io/api/cron/discover-spots-with-apify" + query, {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("Apify spot discovery cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    mocks.refreshApifySpotDiscovery.mockResolvedValue({
      date: "2026-07-15",
      citySlug: "seoul",
      state: "started",
      candidates: 0,
      skippedExisting: 0,
    });
  });

  it("rejects invalid cron authorization before provider work", async () => {
    const { GET } = await import("@/app/api/cron/discover-spots-with-apify/route");
    const response = await GET(request("wrong"));
    expect(response.status).toBe(401);
    expect(mocks.refreshApifySpotDiscovery).not.toHaveBeenCalled();
    expect(mocks.collectActiveApifySpotDiscovery).not.toHaveBeenCalled();
  });

  it("collects existing results without starting discovery", async () => {
    mocks.collectActiveApifySpotDiscovery.mockResolvedValue({ state: "idle", candidates: 0 });
    const { GET } = await import("@/app/api/cron/discover-spots-with-apify/route");
    const response = await GET(request("cron-secret", "?mode=collect"));
    expect(response.status).toBe(200);
    expect(mocks.collectActiveApifySpotDiscovery).toHaveBeenCalledTimes(1);
    expect(mocks.refreshApifySpotDiscovery).not.toHaveBeenCalled();
  });

  it("rejects unauthorized collection before any work", async () => {
    const { GET } = await import("@/app/api/cron/discover-spots-with-apify/route");
    expect((await GET(request("wrong", "?mode=collect"))).status).toBe(401);
    expect(mocks.collectActiveApifySpotDiscovery).not.toHaveBeenCalled();
  });

  it("returns a sanitized discovery summary", async () => {
    const { GET } = await import("@/app/api/cron/discover-spots-with-apify/route");
    const response = await GET(request("cron-secret"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary).toMatchObject({ citySlug: "seoul", state: "started" });
    expect(JSON.stringify(body)).not.toContain("apify_api_");
  });
});
