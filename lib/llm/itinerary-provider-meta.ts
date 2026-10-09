import { getTrimmedEnv, readGLMProviderConfig, TEXT_MODEL } from "./env";
import type { LLMProviderName, OrchestrationResult } from "./types";

function getProviderModel(provider: LLMProviderName | null): string | null {
  if (!provider) return null;

  if (provider === "glm") return readGLMProviderConfig().model;
  if (provider === "openai") return TEXT_MODEL;
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
  const primaryModel = TEXT_MODEL;
  const providersUsed = result.metrics.providersUsed;
  const provider = getPrimaryStructureProvider(providersUsed);
  const primaryConfigured =
    Boolean(getTrimmedEnv("OPENAI_API_KEY")) || providersUsed.includes("openai");
  const fallbackReason =
    result.fallbackUsed || (provider && provider !== "openai" ? "primary_not_used" : null);

  return {
    provider,
    model: getProviderModel(provider),
    fallbackUsed: Boolean(fallbackReason),
    fallbackReason,
    primaryProvider: "openai" as const,
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
