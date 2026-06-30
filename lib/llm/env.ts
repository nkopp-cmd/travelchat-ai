export const DEFAULT_GLM_MODEL = "glm-5.2";
export const DEFAULT_GLM_BASE_URL = "https://api.z.ai/api/paas/v4/";

export interface GLMProviderConfig {
  apiKey: string | null;
  model: string;
  baseURL: string;
  apiKeySource: "GLM_API_KEY" | "ZAI_API_KEY" | null;
}

export function getTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function readGLMProviderConfig(): GLMProviderConfig {
  const glmApiKey = getTrimmedEnv("GLM_API_KEY");
  const zaiApiKey = getTrimmedEnv("ZAI_API_KEY");

  return {
    apiKey: glmApiKey || zaiApiKey,
    apiKeySource: glmApiKey ? "GLM_API_KEY" : zaiApiKey ? "ZAI_API_KEY" : null,
    model: getTrimmedEnv("GLM_MODEL") || DEFAULT_GLM_MODEL,
    baseURL: getTrimmedEnv("GLM_BASE_URL") || getTrimmedEnv("ZAI_BASE_URL") || DEFAULT_GLM_BASE_URL,
  };
}
