import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/llm/provider-probe", () => ({ runProviderProbes: vi.fn() }));

import { GET } from "@/app/api/cron/ai-provider-probe/route";
import { runProviderProbes } from "@/lib/llm/provider-probe";

const request = (auth?: string) => new NextRequest("https://www.localley.io/api/cron/ai-provider-probe", {
  headers: auth ? { authorization: auth } : {},
});

describe("GET /api/cron/ai-provider-probe", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.mocked(runProviderProbes).mockReset(); });

  it("rejects requests without the cron secret and runs no probe", async () => {
    vi.stubEnv("CRON_SECRET", "cron");
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect(runProviderProbes).not.toHaveBeenCalled();
  });

  it("returns 200 when healthy and 503 when a provider fails, uncached", async () => {
    vi.stubEnv("CRON_SECRET", "cron");
    vi.mocked(runProviderProbes).mockResolvedValueOnce({ ok: true, results: [] });
    const healthy = await GET(request("Bearer cron"));
    expect(healthy.status).toBe(200);
    expect(healthy.headers.get("cache-control")).toBe("no-store");
    vi.mocked(runProviderProbes).mockResolvedValueOnce({
      ok: false,
      results: [{ provider: "openai", ok: false, status: 401, reason: "auth_failed", latencyMs: 40 }],
    });
    const broken = await GET(request("Bearer cron"));
    expect(broken.status).toBe(503);
    expect((await broken.json()).results[0].reason).toBe("auth_failed");
  });
});
