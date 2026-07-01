import { afterEach, describe, expect, it, vi } from "vitest";

import { getChatProviderReadiness } from "@/lib/llm/chat-readiness";

const ENV_NAMES = [
  "GLM_API_KEY",
  "ZAI_API_KEY",
  "GLM_MODEL",
  "GLM_BASE_URL",
  "ZAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "CLAUDE_MODEL",
  "ANTHROPIC_MODEL",
  "CHAT_MODEL",
];

function clearEnv() {
  for (const name of ENV_NAMES) {
    delete process.env[name];
  }
}

describe("chat provider readiness", () => {
  afterEach(() => {
    clearEnv();
  });

  it("reports GLM primary and Anthropic fallback readiness without a health check by default", async () => {
    clearEnv();
    process.env.GLM_API_KEY = " glm-live ";
    process.env.ANTHROPIC_API_KEY = " anthropic-live ";
    const glmProvider = {
      isAvailable: vi.fn(() => true),
      healthCheck: vi.fn(async () => true),
    };

    const readiness = await getChatProviderReadiness({ glmProvider });

    expect(readiness).toMatchObject({
      primary: "glm",
      fallback: "anthropic",
      readyForGlmPrimary: true,
      readyForProductionChat: true,
      issues: [],
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
        model: "claude-sonnet-4-20250514",
      },
    });
    expect(glmProvider.healthCheck).not.toHaveBeenCalled();
  });

  it("runs the explicit GLM health check only when GLM is configured", async () => {
    clearEnv();
    process.env.GLM_API_KEY = "glm-live";
    const glmProvider = {
      isAvailable: vi.fn(() => true),
      healthCheck: vi.fn(async () => true),
    };

    const readiness = await getChatProviderReadiness({
      runGlmHealthCheck: true,
      glmProvider,
    });

    expect(readiness.glm.healthChecked).toBe(true);
    expect(readiness.glm.healthy).toBe(true);
    expect(readiness.readyForGlmPrimary).toBe(true);
    expect(glmProvider.healthCheck).toHaveBeenCalledOnce();
  });

  it("does not spend a health check when GLM is unavailable", async () => {
    clearEnv();
    process.env.GLM_API_KEY = " ";
    const glmProvider = {
      isAvailable: vi.fn(() => false),
      healthCheck: vi.fn(async () => true),
    };

    const readiness = await getChatProviderReadiness({
      runGlmHealthCheck: true,
      glmProvider,
    });

    expect(readiness.glm).toMatchObject({
      configured: false,
      healthChecked: true,
      healthy: null,
      env: {
        hasGlmApiKey: false,
        hasZaiApiKey: false,
        apiKeySource: null,
      },
    });
    expect(readiness).toMatchObject({
      readyForGlmPrimary: false,
      readyForProductionChat: false,
      issues: ["glm_api_key_missing", "anthropic_fallback_missing"],
    });
    expect(glmProvider.healthCheck).not.toHaveBeenCalled();
  });

  it("reports a failed GLM health check as not ready for primary use", async () => {
    clearEnv();
    process.env.GLM_API_KEY = "glm-live";
    process.env.ANTHROPIC_API_KEY = "anthropic-live";
    const glmProvider = {
      isAvailable: vi.fn(() => true),
      healthCheck: vi.fn(async () => false),
    };

    const readiness = await getChatProviderReadiness({
      runGlmHealthCheck: true,
      glmProvider,
    });

    expect(readiness).toMatchObject({
      readyForGlmPrimary: false,
      readyForProductionChat: false,
      issues: ["glm_health_failed"],
    });
  });

  it("reports the ZAI alias and fallback model precedence", async () => {
    clearEnv();
    process.env.ZAI_API_KEY = " zai-live ";
    process.env.ZAI_BASE_URL = " https://example.test/v4/ ";
    process.env.ANTHROPIC_API_KEY = "anthropic-live";
    process.env.ANTHROPIC_MODEL = " claude-fallback ";
    process.env.CHAT_MODEL = "claude-legacy";
    const glmProvider = {
      isAvailable: vi.fn(() => true),
      healthCheck: vi.fn(async () => true),
    };

    const readiness = await getChatProviderReadiness({ glmProvider });

    expect(readiness.glm).toMatchObject({
      configured: true,
      baseUrl: "https://example.test/v4/",
      env: {
        hasGlmApiKey: false,
        hasZaiApiKey: true,
        apiKeySource: "ZAI_API_KEY",
      },
    });
    expect(readiness.anthropicFallback).toMatchObject({
      configured: true,
      model: "claude-fallback",
    });
    expect(readiness.readyForProductionChat).toBe(true);
  });
});
