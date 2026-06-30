import { describe, expect, it, vi } from "vitest";
import { LLMOrchestrator } from "@/lib/llm";
import type {
  GeneratedItinerary,
  OrchestrationMetrics,
  OrchestrationRequest,
} from "@/lib/llm";

const itinerary: GeneratedItinerary = {
  title: "Tokyo Food Trail",
  subtitle: "Local counters and market lanes",
  city: "Tokyo",
  days: 1,
  localScore: 8,
  estimatedCost: "$80-120",
  highlights: ["Local counters"],
  dailyPlans: [
    {
      day: 1,
      theme: "Markets",
      activities: [
        {
          time: "10:00 AM",
          type: "morning",
          name: "Tsukiji Outer Market",
          address: "Tsukiji Outer Market, Chuo City, Tokyo",
          description: "Start with stalls that still serve the early market crowd.",
          category: "market",
          localleyScore: 5,
          duration: "2 hours",
          cost: "$20-40",
        },
      ],
    },
  ],
};

function createRequest(): OrchestrationRequest {
  return {
    type: "itinerary",
    params: {
      city: "Tokyo",
      days: 1,
      interests: ["food"],
      budget: "moderate",
      localnessLevel: 5,
      pace: "moderate",
      groupType: "solo",
    },
    tier: "free",
    userId: "user_test",
    requestId: "request_test",
  };
}

function createMetrics(): OrchestrationMetrics {
  return {
    totalLatencyMs: 0,
    providersUsed: [],
    cacheHits: 0,
    retryCount: 0,
  };
}

function createProvider(name: "glm" | "openai", available: boolean, result: "success" | "fail") {
  return {
    name,
    isAvailable: vi.fn(() => available),
    generateItineraryStructure: vi.fn(async () => {
      if (result === "fail") {
        throw new Error(`${name} failed`);
      }
      return itinerary;
    }),
  };
}

function createOrchestrator(glm: ReturnType<typeof createProvider>, openai: ReturnType<typeof createProvider>) {
  const orchestrator = new LLMOrchestrator();

  Object.assign(orchestrator as unknown as Record<string, unknown>, {
    glm,
    openai,
    circuitBreakers: {
      isAvailable: vi.fn(() => true),
      recordFailure: vi.fn(),
    },
  });

  return orchestrator as unknown as {
    executeSingleLLM: (
      request: OrchestrationRequest,
      metrics: OrchestrationMetrics,
      startTime: number
    ) => ReturnType<LLMOrchestrator["generateItinerary"]>;
  };
}

describe("LLMOrchestrator single-LLM provider routing", () => {
  it("uses GLM first when GLM is available", async () => {
    const glm = createProvider("glm", true, "success");
    const openai = createProvider("openai", true, "success");
    const orchestrator = createOrchestrator(glm, openai);

    const result = await orchestrator.executeSingleLLM(
      createRequest(),
      createMetrics(),
      Date.now()
    );

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Tokyo Food Trail");
    expect(result.metrics.providersUsed).toEqual(["glm"]);
    expect(result.fallbackUsed).toBeUndefined();
    expect(openai.generateItineraryStructure).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when GLM generation fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const glm = createProvider("glm", true, "fail");
    const openai = createProvider("openai", true, "success");
    const orchestrator = createOrchestrator(glm, openai);

    const result = await orchestrator.executeSingleLLM(
      createRequest(),
      createMetrics(),
      Date.now()
    );

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe("Tokyo Food Trail");
    expect(result.metrics.providersUsed).toEqual(["openai"]);
    expect(result.metrics.retryCount).toBe(1);
    expect(result.fallbackUsed).toBe("chatgpt_fallback");
    expect(openai.generateItineraryStructure).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
