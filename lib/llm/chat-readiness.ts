import { getAnthropicChatModel } from "./chat-provider";
import { getTrimmedEnv, readGLMProviderConfig } from "./env";
import { GLMProvider } from "./providers/glm";
import type { BaseLLMProvider } from "./providers/base";

export interface ChatProviderReadiness {
  primary: "glm";
  fallback: "anthropic";
  readyForGlmPrimary: boolean;
  readyForProductionChat: boolean;
  issues: Array<
    | "glm_api_key_missing"
    | "glm_health_failed"
    | "anthropic_fallback_missing"
  >;
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

  return {
    primary: "glm",
    fallback: "anthropic",
    readyForGlmPrimary,
    readyForProductionChat: readyForGlmPrimary && anthropicFallbackConfigured,
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
  };
}
