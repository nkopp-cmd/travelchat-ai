import { afterEach, describe, expect, it } from "vitest";

import { buildItineraryProviderMeta } from "@/lib/llm/itinerary-provider-meta";
import type { OrchestrationResult } from "@/lib/llm/types";

function createResult(
  partial: Partial<OrchestrationResult>,
): OrchestrationResult {
  return {
    success: true,
    data: undefined,
    qualityScore: null,
    validationReport: null,
    metrics: {
      totalLatencyMs: 120,
      providersUsed: ["openai"],
      cacheHits: 0,
      retryCount: 0,
    },
    ...partial,
  };
}

function clearGLMEnv() {
  delete process.env.GLM_API_KEY;
  delete process.env.ZAI_API_KEY;
}

describe("buildItineraryProviderMeta", () => {
  afterEach(() => {
    clearGLMEnv();
  });

  it("reports the active primary provider accurately", () => {
    clearGLMEnv();

    expect(buildItineraryProviderMeta(createResult({}))).toMatchObject({
      provider: "openai",
      model: "gpt-6-luna",
      fallbackUsed: false,
      fallbackReason: null,
      primaryProvider: "openai",
      primaryModel: "gpt-6-luna",
      primaryConfigured: true,
      metrics: {
        providersUsed: ["openai"],
        cacheHits: 0,
        retryCount: 0,
      },
    });
  });

  it("retains historical fallback diagnostics", () => {
    clearGLMEnv();

    expect(
      buildItineraryProviderMeta(
        createResult({
          fallbackUsed: "chatgpt_fallback",
          metrics: {
            totalLatencyMs: 180,
            providersUsed: ["openai"],
            cacheHits: 1,
            retryCount: 1,
            fallbackRoute: "openai_only",
          },
        }),
      ),
    ).toMatchObject({
      provider: "openai",
      model: "gpt-6-luna",
      fallbackUsed: true,
      fallbackReason: "chatgpt_fallback",
      primaryProvider: "openai",
      primaryConfigured: true,
      metrics: {
        providersUsed: ["openai"],
        cacheHits: 1,
        retryCount: 1,
        fallbackRoute: "openai_only",
      },
    });
  });

  it("keeps active provider configuration accurate", () => {
    clearGLMEnv();
    process.env.GLM_API_KEY = "glm-live";

    expect(
      buildItineraryProviderMeta(
        createResult({
          fallbackUsed: "chatgpt_fallback",
          metrics: {
            totalLatencyMs: 220,
            providersUsed: ["openai"],
            cacheHits: 0,
            retryCount: 1,
            fallbackRoute: "openai_only",
          },
        }),
      ),
    ).toMatchObject({
      provider: "openai",
      fallbackUsed: true,
      fallbackReason: "chatgpt_fallback",
      primaryProvider: "openai",
      primaryConfigured: true,
      metrics: {
        providersUsed: ["openai"],
      },
    });
  });
});
