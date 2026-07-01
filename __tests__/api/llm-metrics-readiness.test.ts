import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChatProviderReadiness: vi.fn(async ({ runGlmHealthCheck = false } = {}) => ({
    primary: "glm",
    fallback: "anthropic",
    glm: {
      configured: true,
      healthChecked: runGlmHealthCheck,
      healthy: runGlmHealthCheck ? true : null,
      model: "glm-5.2",
      baseUrl: "https://api.z.ai/api/paas/v4/",
      env: {
        hasGlmApiKey: true,
        hasZaiApiKey: false,
        apiKeySource: "GLM_API_KEY",
      },
    },
    anthropicFallback: {
      configured: true,
      model: "claude-sonnet-4-20250514",
    },
  })),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => ({ response: null, userId: "admin_test" })),
}));

vi.mock("@/lib/llm", () => ({
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

vi.mock("@/lib/llm/chat-readiness", () => ({
  getChatProviderReadiness: mocks.getChatProviderReadiness,
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
          apiKeySource: "GLM_API_KEY",
        },
      },
      anthropicFallback: {
        configured: true,
      },
    });
    expect(mocks.getChatProviderReadiness).toHaveBeenCalledWith({
      runGlmHealthCheck: false,
    });
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
    expect(mocks.getChatProviderReadiness).toHaveBeenCalledWith({
      runGlmHealthCheck: true,
    });
  });
});
