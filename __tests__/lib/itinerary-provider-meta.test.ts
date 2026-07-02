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
      providersUsed: ["glm"],
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

  it("reports GLM as the primary itinerary provider when GLM generated structure", () => {
    clearGLMEnv();

    expect(buildItineraryProviderMeta(createResult({}))).toMatchObject({
      provider: "glm",
      model: "glm-5.2",
      fallbackUsed: false,
      fallbackReason: null,
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
      primaryConfigured: true,
      metrics: {
        providersUsed: ["glm"],
        cacheHits: 0,
        retryCount: 0,
      },
    });
  });

  it("reports OpenAI fallback when GLM did not generate structure", () => {
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
      model: "gpt-4o",
      fallbackUsed: true,
      fallbackReason: "chatgpt_fallback",
      primaryProvider: "glm",
      primaryConfigured: false,
      metrics: {
        providersUsed: ["openai"],
        cacheHits: 1,
        retryCount: 1,
        fallbackRoute: "openai_only",
      },
    });
  });

  it("keeps primaryConfigured true when configured GLM fails and OpenAI succeeds", () => {
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
      primaryProvider: "glm",
      primaryConfigured: true,
      metrics: {
        providersUsed: ["openai"],
      },
    });
  });
});
