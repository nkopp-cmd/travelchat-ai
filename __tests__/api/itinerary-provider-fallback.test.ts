import { afterEach, describe, expect, it, vi } from "vitest";
import { generateItineraryTextWithFallback, getOpenAIItineraryFallbackModel } from "@/app/api/itineraries/generate/provider-fallback";
describe("single itinerary text provider", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("uses the requested model and never invokes the old provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubEnv("OPENAI_MODEL", "old-model");
    const glm = { isAvailable: vi.fn(() => true), generateText: vi.fn() };
    const generateWithOpenAI = vi.fn().mockResolvedValue('{"title":"Seoul","dailyPlans":[]}');
    const result = await generateItineraryTextWithFallback({ systemPrompt: "System", userPrompt: "Plan Seoul" }, { glm, generateWithOpenAI });
    expect(result).toMatchObject({ model: "gpt-6-luna", provider: "openai", primaryProvider: "openai", primaryConfigured: true,
      fallbackUsed: false, fallbackReason: null, rawContent: '{"title":"Seoul","dailyPlans":[]}' });
    expect(generateWithOpenAI).toHaveBeenCalledExactlyOnceWith("System", "Plan Seoul");
    expect(glm.generateText).not.toHaveBeenCalled(); expect(getOpenAIItineraryFallbackModel()).toBe("gpt-6-luna");
  });
  it("propagates provider errors without a silent provider switch", async () => {
    const glm = { isAvailable: vi.fn(() => true), generateText: vi.fn() };
    await expect(generateItineraryTextWithFallback({ systemPrompt: "System", userPrompt: "Plan" },
      { glm, generateWithOpenAI: vi.fn().mockRejectedValue(Error("unavailable")) })).rejects.toThrow("unavailable");
    expect(glm.generateText).not.toHaveBeenCalled();
  });
});
