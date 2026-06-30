import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  glmIsAvailable: vi.fn(() => true),
  glmHealthCheck: vi.fn(async () => true),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => ({ response: null, userId: "admin_test" })),
}));

vi.mock("@/lib/llm", () => ({
  GLMProvider: vi.fn().mockImplementation(function GLMProviderMock() {
    return {
    isAvailable: mocks.glmIsAvailable,
    healthCheck: mocks.glmHealthCheck,
    };
  }),
  getMetricsCollector: vi.fn(() => ({
    getMetrics: vi.fn(() => ({ requests: 0 })),
    clear: vi.fn(),
  })),
  getOrchestrator: vi.fn(() => ({
    getHealthStatus: vi.fn(() => ({
      providers: { glm: true, openai: true, gemini: true, claude: true },
    })),
  })),
  estimateOrchestrationCost: vi.fn((tier: string) => ({
    tier,
    estimatedCost: 0,
  })),
}));

describe("admin LLM metrics readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GLM_API_KEY = "test-glm-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    delete process.env.ZAI_API_KEY;
    delete process.env.GLM_MODEL;
    delete process.env.GLM_BASE_URL;
    delete process.env.ZAI_BASE_URL;
  });

  it("reports GLM primary readiness without running a health check by default", async () => {
    const { GET } = await import("@/app/api/admin/llm-metrics/route");

    const response = await GET(
      new NextRequest("https://www.localley.io/api/admin/llm-metrics")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.chatProviderReadiness).toMatchObject({
      primary: "glm",
      fallback: "anthropic",
      glm: {
        configured: true,
        healthChecked: false,
        healthy: null,
        model: "glm-5.2",
        baseUrl: "https://api.z.ai/api/paas/v4/",
        env: {
          hasGlmApiKey: true,
          hasZaiApiKey: false,
        },
      },
      anthropicFallback: {
        configured: true,
      },
    });
    expect(mocks.glmHealthCheck).not.toHaveBeenCalled();
  });

  it("runs the explicit GLM health check when requested", async () => {
    const { GET } = await import("@/app/api/admin/llm-metrics/route");

    const response = await GET(
      new NextRequest("https://www.localley.io/api/admin/llm-metrics?health=glm")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.chatProviderReadiness.glm).toMatchObject({
      configured: true,
      healthChecked: true,
      healthy: true,
    });
    expect(mocks.glmHealthCheck).toHaveBeenCalledTimes(1);
  });
});
