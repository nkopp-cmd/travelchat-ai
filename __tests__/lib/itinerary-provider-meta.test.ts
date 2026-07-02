import { describe, expect, it } from "vitest";

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

describe("buildItineraryProviderMeta", () => {
  it("reports GLM as the primary itinerary provider when GLM generated structure", () => {
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
});
