import { getAnthropicChatModel } from "./chat-provider";
import { getTrimmedEnv, readGLMProviderConfig } from "./env";
import { GLMProvider } from "./providers/glm";
import type { BaseLLMProvider } from "./providers/base";

export type ChatProviderReadinessIssue =
  | "glm_api_key_missing"
  | "glm_health_failed"
  | "anthropic_fallback_missing"
  | "openai_itinerary_fallback_missing";

export interface ChatProviderReadiness {
  primary: "glm";
  fallback: "anthropic";
  readyForGlmPrimary: boolean;
  readyForProductionChat: boolean;
  readyForProductionItinerary: boolean;
  readyForProductionAI: boolean;
  issues: ChatProviderReadinessIssue[];
  glm: {
    configured: boolean;
    healthChecked: boolean;
    healthy: boolean | null;
    model: string;
    baseUrl: string;
    env: {
      hasGlmApiKey: boolean;
      hasZaiApiKey: boolean;
      apiKeySource: "GLM_API_KEY" | "ZAI_API_KEY" | null;
    };
  };
  anthropicFallback: {
    configured: boolean;
    model: string;
  };
  itineraryFallback: {
    provider: "openai";
    configured: boolean;
    model: string;
  };
}

export function getChatProviderReadinessFailure(
  readiness: Pick<ChatProviderReadiness, "readyForProductionAI" | "issues">,
): string | null {
  if (readiness.readyForProductionAI) return null;

  const issueList = readiness.issues.length
    ? readiness.issues.join(", ")
    : "unknown_readiness_gap";

  return `Production AI readiness failed: ${issueList}`;
}

export function getChatProviderReadinessActions(
  readiness: Pick<ChatProviderReadiness, "issues">,
): string[] {
  const actions: string[] = [];

  for (const issue of readiness.issues) {
    switch (issue) {
      case "glm_api_key_missing":
        actions.push(
          "Add GLM_API_KEY in Vercel and local env; keep GLM_MODEL=glm-5.2 and GLM_BASE_URL=https://api.z.ai/api/paas/v4/.",
        );
        break;
      case "glm_health_failed":
        actions.push(
          "Verify the GLM key, model, and base URL with npm run llm:readiness -- --health --strict before promoting GLM traffic.",
        );
        break;
      case "anthropic_fallback_missing":
        actions.push(
          "Keep ANTHROPIC_API_KEY configured so chat can fall back when GLM is unavailable or returns an empty response.",
        );
        break;
      case "openai_itinerary_fallback_missing":
        actions.push(
          "Keep OPENAI_API_KEY configured so itinerary generation has a paid OpenAI fallback behind the GLM primary path.",
        );
        break;
    }
  }

  return actions;
}

export async function getChatProviderReadiness({
  runGlmHealthCheck = false,
  glmProvider,
}: {
  runGlmHealthCheck?: boolean;
  glmProvider?: Pick<BaseLLMProvider, "isAvailable" | "healthCheck">;
} = {}): Promise<ChatProviderReadiness> {
  const glm = glmProvider ?? new GLMProvider();
  const glmConfig = readGLMProviderConfig();
  const glmConfigured = glm.isAvailable();
  let glmHealthy: boolean | null = null;

  if (runGlmHealthCheck && glmConfigured) {
    glmHealthy = await glm.healthCheck();
  }

  const anthropicFallbackConfigured = Boolean(getTrimmedEnv("ANTHROPIC_API_KEY"));
  const openaiItineraryFallbackConfigured = Boolean(getTrimmedEnv("OPENAI_API_KEY"));
  const readyForGlmPrimary =
    glmConfigured && (!runGlmHealthCheck || glmHealthy === true);
  const issues: ChatProviderReadiness["issues"] = [];

  if (!glmConfigured) issues.push("glm_api_key_missing");
  if (runGlmHealthCheck && glmConfigured && glmHealthy !== true) {
    issues.push("glm_health_failed");
  }
  if (!anthropicFallbackConfigured) {
    issues.push("anthropic_fallback_missing");
  }
  if (!openaiItineraryFallbackConfigured) {
    issues.push("openai_itinerary_fallback_missing");
  }

  const readyForProductionChat = readyForGlmPrimary && anthropicFallbackConfigured;
  const readyForProductionItinerary =
    readyForGlmPrimary && openaiItineraryFallbackConfigured;

  return {
    primary: "glm",
    fallback: "anthropic",
    readyForGlmPrimary,
    readyForProductionChat,
    readyForProductionItinerary,
    readyForProductionAI: readyForProductionChat && readyForProductionItinerary,
    issues,
    glm: {
      configured: glmConfigured,
      healthChecked: runGlmHealthCheck,
      healthy: glmHealthy,
      model: glmConfig.model,
      baseUrl: glmConfig.baseURL,
      env: {
        hasGlmApiKey: Boolean(getTrimmedEnv("GLM_API_KEY")),
        hasZaiApiKey: Boolean(getTrimmedEnv("ZAI_API_KEY")),
        apiKeySource: glmConfig.apiKeySource,
      },
    },
    anthropicFallback: {
      configured: anthropicFallbackConfigured,
      model: getAnthropicChatModel(),
    },
    itineraryFallback: {
      provider: "openai",
      configured: openaiItineraryFallbackConfigured,
      model: getTrimmedEnv("OPENAI_MODEL") || "gpt-4o",
    },
  };
}
