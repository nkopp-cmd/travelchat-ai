import { describe, expect, it, vi } from "vitest";

import { generateItineraryTextWithFallback } from "@/app/api/itineraries/generate/provider-fallback";

describe("itinerary provider fallback", () => {
  it("uses GLM as the primary itinerary text provider when available", async () => {
    const glm = {
      isAvailable: vi.fn(() => true),
      generateText: vi.fn(async () => ({
        content: '{"title":"Seoul Cafes","dailyPlans":[]}',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        latencyMs: 10,
        provider: "glm" as const,
      })),
    };
    const generateWithOpenAI = vi.fn(async () => '{"title":"OpenAI","dailyPlans":[]}');

    const result = await generateItineraryTextWithFallback(
      {
        systemPrompt: "System",
        userPrompt: "Plan Seoul",
        maxTokens: 1200,
        temperature: 0.3,
      },
      { glm, generateWithOpenAI }
    );

    expect(result).toEqual({
      rawContent: '{"title":"Seoul Cafes","dailyPlans":[]}',
      provider: "glm",
      fallbackUsed: false,
    });
    expect(glm.generateText).toHaveBeenCalledWith({
      systemPrompt: "System",
      userPrompt: "Plan Seoul",
      responseFormat: "json",
      temperature: 0.3,
      maxTokens: 1200,
    });
    expect(generateWithOpenAI).not.toHaveBeenCalled();
  });

  it("uses OpenAI without marking fallback when GLM is unavailable", async () => {
    const glm = {
      isAvailable: vi.fn(() => false),
      generateText: vi.fn(),
    };
    const generateWithOpenAI = vi.fn(async () => '{"title":"OpenAI","dailyPlans":[]}');

    const result = await generateItineraryTextWithFallback(
      {
        systemPrompt: "System",
        userPrompt: "Plan Seoul",
      },
      { glm, generateWithOpenAI }
    );

    expect(result).toEqual({
      rawContent: '{"title":"OpenAI","dailyPlans":[]}',
      provider: "openai",
      fallbackUsed: false,
    });
    expect(glm.generateText).not.toHaveBeenCalled();
    expect(generateWithOpenAI).toHaveBeenCalledWith("System", "Plan Seoul");
  });

  it("marks fallback when GLM errors and OpenAI handles the response", async () => {
    const glm = {
      isAvailable: vi.fn(() => true),
      generateText: vi.fn(async () => {
        throw new Error("temporary GLM outage");
      }),
    };
    const generateWithOpenAI = vi.fn(async () => '{"title":"OpenAI","dailyPlans":[]}');
    const logger = { error: vi.fn() };

    const result = await generateItineraryTextWithFallback(
      {
        systemPrompt: "System",
        userPrompt: "Plan Seoul",
      },
      { glm, generateWithOpenAI, logger }
    );

    expect(result).toEqual({
      rawContent: '{"title":"OpenAI","dailyPlans":[]}',
      provider: "openai",
      fallbackUsed: true,
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(generateWithOpenAI).toHaveBeenCalledOnce();
  });

  it("marks fallback when GLM returns an empty itinerary response", async () => {
    const glm = {
      isAvailable: vi.fn(() => true),
      generateText: vi.fn(async () => ({
        content: "   ",
        usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
        latencyMs: 10,
        provider: "glm" as const,
      })),
    };
    const generateWithOpenAI = vi.fn(async () => '{"title":"OpenAI","dailyPlans":[]}');
    const logger = { error: vi.fn() };

    const result = await generateItineraryTextWithFallback(
      {
        systemPrompt: "System",
        userPrompt: "Plan Seoul",
      },
      { glm, generateWithOpenAI, logger }
    );

    expect(result).toMatchObject({
      provider: "openai",
      fallbackUsed: true,
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(generateWithOpenAI).toHaveBeenCalledOnce();
  });
});
