import { getOpenAIChatModel } from "./chat-provider";
import { getTrimmedEnv, readGLMProviderConfig, TEXT_MODEL } from "./env";
import type { BaseLLMProvider } from "./providers/base";

export type ChatProviderReadinessIssue =
  | "glm_api_key_missing"
  | "glm_health_failed"
  | "openai_chat_fallback_missing"
  | "openai_itinerary_fallback_missing";

export interface ChatProviderReadiness {
  primary: "openai";
  fallback: null;
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
  chatFallback: {
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
      case "openai_chat_fallback_missing":
        actions.push(
          "Configure OPENAI_API_KEY for production chat.",
        );
        break;
      case "openai_itinerary_fallback_missing":
        actions.push(
          "Configure OPENAI_API_KEY for production itinerary generation.",
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
  void runGlmHealthCheck;
  void glmProvider;
  const glmConfig = readGLMProviderConfig();
  const glmConfigured = Boolean(glmConfig.apiKey);
  const glmHealthy: boolean | null = null;

  const chatFallbackConfigured = Boolean(getTrimmedEnv("OPENAI_API_KEY"));
  const openaiItineraryFallbackConfigured = Boolean(getTrimmedEnv("OPENAI_API_KEY"));
  const readyForGlmPrimary = false;
  const issues: ChatProviderReadiness["issues"] = [];
  if (!chatFallbackConfigured) {
    issues.push("openai_chat_fallback_missing");
  }
  if (!openaiItineraryFallbackConfigured) {
    issues.push("openai_itinerary_fallback_missing");
  }

  const readyForProductionChat = chatFallbackConfigured;
  const readyForProductionItinerary =
    openaiItineraryFallbackConfigured;

  return {
    primary: "openai",
    fallback: null,
    readyForGlmPrimary,
    readyForProductionChat,
    readyForProductionItinerary,
    readyForProductionAI: readyForProductionChat && readyForProductionItinerary,
    issues,
    glm: {
      configured: glmConfigured,
      healthChecked: false,
      healthy: glmHealthy,
      model: glmConfig.model,
      baseUrl: glmConfig.baseURL,
      env: {
        hasGlmApiKey: Boolean(getTrimmedEnv("GLM_API_KEY")),
        hasZaiApiKey: Boolean(getTrimmedEnv("ZAI_API_KEY")),
        apiKeySource: glmConfig.apiKeySource,
      },
    },
    chatFallback: {
      configured: chatFallbackConfigured,
      model: getOpenAIChatModel(),
    },
    itineraryFallback: {
      provider: "openai",
      configured: openaiItineraryFallbackConfigured,
      model: TEXT_MODEL,
    },
  };
}
