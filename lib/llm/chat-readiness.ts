import { getAnthropicChatModel } from "./chat-provider";
import { getTrimmedEnv, readGLMProviderConfig } from "./env";
import { GLMProvider } from "./providers/glm";
import type { BaseLLMProvider } from "./providers/base";

export interface ChatProviderReadiness {
  primary: "glm";
  fallback: "anthropic";
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

  return {
    primary: "glm",
    fallback: "anthropic",
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
      configured: Boolean(getTrimmedEnv("ANTHROPIC_API_KEY")),
      model: getAnthropicChatModel(),
    },
  };
}
