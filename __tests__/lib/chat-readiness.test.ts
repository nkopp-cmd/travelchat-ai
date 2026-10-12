import { afterEach, describe, expect, it, vi } from "vitest";
import { getChatProviderReadiness, getChatProviderReadinessFailure } from "@/lib/llm/chat-readiness";
describe("current production readiness", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("requires only the active text provider and does not probe legacy providers", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubEnv("GLM_API_KEY", ""); vi.stubEnv("ZAI_API_KEY", "");
    const glmProvider = { isAvailable: vi.fn(() => false), healthCheck: vi.fn() };
    const r = await getChatProviderReadiness({ runGlmHealthCheck: true, glmProvider });
    expect(r).toMatchObject({ primary: "openai", fallback: null, readyForProductionAI: true, issues: [],
      chatFallback: { model: "gpt-6-luna" }, itineraryFallback: { model: "gpt-6-luna" } });
    expect(glmProvider.healthCheck).not.toHaveBeenCalled();
  });
  it("refuses readiness when only legacy credentials exist", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("GLM_API_KEY", "legacy");
    const r = await getChatProviderReadiness();
    expect(r.readyForProductionAI).toBe(false);
    expect(r.issues).toEqual(["openai_chat_fallback_missing", "openai_itinerary_fallback_missing"]);
    expect(getChatProviderReadinessFailure(r)).toContain("Production AI readiness failed");
  });
});
