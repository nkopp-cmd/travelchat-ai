import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GLM_BASE_URL,
  DEFAULT_GLM_MODEL,
  getTrimmedEnv,
  readGLMProviderConfig,
} from "@/lib/llm/env";
import { GLMProvider } from "@/lib/llm/providers/glm";
import { OpenAI } from "openai";

vi.mock("openai", () => ({
  OpenAI: vi.fn().mockImplementation(function OpenAIMock() {
    return {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };
  }),
}));

const ENV_NAMES = [
  "GLM_API_KEY",
  "ZAI_API_KEY",
  "GLM_MODEL",
  "GLM_BASE_URL",
  "ZAI_BASE_URL",
];

function clearGLMEnv() {
  for (const name of ENV_NAMES) {
    delete process.env[name];
  }
}

describe("GLM provider env handling", () => {
  afterEach(() => {
    clearGLMEnv();
  });

  it("treats missing and blank GLM keys as unavailable", () => {
    clearGLMEnv();
    process.env.GLM_API_KEY = "   ";

    expect(getTrimmedEnv("GLM_API_KEY")).toBeNull();
    expect(readGLMProviderConfig()).toMatchObject({
      apiKey: null,
      apiKeySource: null,
      model: DEFAULT_GLM_MODEL,
      baseURL: DEFAULT_GLM_BASE_URL,
    });
    expect(new GLMProvider().isAvailable()).toBe(false);
  });

  it("prefers a trimmed GLM key over the ZAI alias", () => {
    clearGLMEnv();
    process.env.GLM_API_KEY = "  glm_live_key  ";
    process.env.ZAI_API_KEY = "zai_alias_key";
    process.env.GLM_MODEL = "  glm-5.2  ";
    process.env.GLM_BASE_URL = "  https://api.z.ai/api/paas/v4/  ";

    expect(readGLMProviderConfig()).toEqual({
      apiKey: "glm_live_key",
      apiKeySource: "GLM_API_KEY",
      model: "glm-5.2",
      baseURL: "https://api.z.ai/api/paas/v4/",
    });
    expect(new GLMProvider().isAvailable()).toBe(true);
    expect(OpenAI).toHaveBeenLastCalledWith({
      apiKey: "glm_live_key",
      baseURL: "https://api.z.ai/api/paas/v4/",
      defaultHeaders: {
        "Accept-Language": "en-US,en",
      },
    });
  });

  it("uses the ZAI alias when GLM_API_KEY is absent or blank", () => {
    clearGLMEnv();
    process.env.GLM_API_KEY = "";
    process.env.ZAI_API_KEY = "  zai_live_key  ";
    process.env.ZAI_BASE_URL = "  https://example.test/v4/  ";

    expect(readGLMProviderConfig()).toEqual({
      apiKey: "zai_live_key",
      apiKeySource: "ZAI_API_KEY",
      model: DEFAULT_GLM_MODEL,
      baseURL: "https://example.test/v4/",
    });
    expect(new GLMProvider().isAvailable()).toBe(true);
  });
});
