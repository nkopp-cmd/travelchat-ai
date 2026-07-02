import { getTrimmedEnv, readGLMProviderConfig } from "./env";
import type { LLMProviderName, OrchestrationResult } from "./types";

function getProviderModel(provider: LLMProviderName | null): string | null {
  if (!provider) return null;

  if (provider === "glm") return readGLMProviderConfig().model;
  if (provider === "openai") return getTrimmedEnv("OPENAI_MODEL") || "gpt-4o";
  if (provider === "gemini") return getTrimmedEnv("GEMINI_MODEL") || "gemini-1.5-flash";
  if (provider === "claude") {
    return (
      getTrimmedEnv("CLAUDE_MODEL") ||
      getTrimmedEnv("ANTHROPIC_MODEL") ||
      "claude-sonnet-4-20250514"
    );
  }

  return null;
}

function getPrimaryStructureProvider(
  providersUsed: LLMProviderName[],
): LLMProviderName | null {
  return (
    providersUsed.find((provider) =>
      provider === "glm" || provider === "openai" || provider === "gemini"
    ) || null
  );
}

export function buildItineraryProviderMeta(result: OrchestrationResult) {
  const primaryConfig = readGLMProviderConfig();
  const primaryModel = primaryConfig.model;
  const providersUsed = result.metrics.providersUsed;
  const provider = getPrimaryStructureProvider(providersUsed);
  const primaryConfigured =
    Boolean(primaryConfig.apiKey) || providersUsed.includes("glm");
  const fallbackReason =
    result.fallbackUsed || (provider && provider !== "glm" ? "glm_not_used" : null);

  return {
    provider,
    model: getProviderModel(provider),
    fallbackUsed: Boolean(fallbackReason),
    fallbackReason,
    primaryProvider: "glm" as const,
    primaryModel,
    primaryConfigured,
    qualityScore: result.qualityScore ?? null,
    validationReport: result.validationReport ?? null,
    metrics: {
      totalLatencyMs: result.metrics.totalLatencyMs,
      providersUsed,
      cacheHits: result.metrics.cacheHits,
      retryCount: result.metrics.retryCount,
      fallbackRoute: result.metrics.fallbackRoute ?? null,
    },
  };
}
