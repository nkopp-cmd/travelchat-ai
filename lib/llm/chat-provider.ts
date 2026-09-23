import OpenAI from "openai";

import { getTrimmedEnv, readGLMProviderConfig } from "./env";
import { GLMProvider } from "./providers/glm";
import type { TextGenerationProvider } from "./providers/base";

export type ChatProviderName = "glm" | "openai";
export type ChatFallbackReason =
  | "glm_unavailable"
  | "glm_error"
  | "glm_empty_response"
  | null;

export interface ChatMessage {
  role: string;
  content: string;
}

interface OpenAIChatClient {
  chat: {
    completions: {
      create(input: {
        model: string;
        max_completion_tokens: number;
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      }): Promise<{ choices: Array<{ message?: { content?: string | null } }> }>;
    };
  };
}

export interface ChatProviderResult {
  content: string;
  provider: ChatProviderName;
  model: string;
  fallbackUsed: boolean;
  fallbackReason: ChatFallbackReason;
  primaryProvider: "glm";
  primaryModel: string;
  primaryConfigured: boolean;
}

interface ChatProviderDependencies {
  glm?: Pick<TextGenerationProvider, "isAvailable" | "generateText">;
  openai?: OpenAIChatClient;
  openaiModel?: string;
  logger?: Pick<Console, "error">;
}

// Chat fallback moved from Anthropic to OpenAI (2026-09-23): the Anthropic key had no
// credit and its SDK failed on Cloudflare Workers; the OpenAI SDK works there (GLM uses it).
export const DEFAULT_OPENAI_CHAT_MODEL = "gpt-5.6-luna";

export function getOpenAIChatModel(): string {
  return getTrimmedEnv("OPENAI_CHAT_MODEL") || DEFAULT_OPENAI_CHAT_MODEL;
}

export function buildChatTranscript(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role === "assistant" ? "Alley" : "User"}: ${message.content}`)
    .join("\n\n");
}

function getOpenAIClient(): OpenAIChatClient {
  const apiKey = getTrimmedEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OpenAI API key is not configured");
  }

  return new OpenAI({ apiKey, maxRetries: 0 });
}

export async function generateChatReplyWithFallback(
  input: {
    systemPrompt: string;
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
  },
  dependencies: ChatProviderDependencies = {}
): Promise<ChatProviderResult> {
  const glm = dependencies.glm ?? new GLMProvider();
  const primaryModel = readGLMProviderConfig().model;
  const maxTokens = input.maxTokens ?? 2048;
  const temperature = input.temperature ?? 0.7;
  const primaryConfigured = glm.isAvailable();
  let glmWasAttempted = false;
  let fallbackReason: ChatFallbackReason = null;

  if (primaryConfigured) {
    glmWasAttempted = true;

    try {
      const response = await glm.generateText({
        systemPrompt: input.systemPrompt,
        userPrompt: buildChatTranscript(input.messages),
        maxTokens,
        temperature,
      });
      const content = response.content.trim();

      if (!content) {
        fallbackReason = "glm_empty_response";
        throw new Error("GLM returned an empty chat response");
      }

      return {
        content,
        provider: "glm",
        model: primaryModel,
        fallbackUsed: false,
        fallbackReason: null,
        primaryProvider: "glm",
        primaryModel,
        primaryConfigured,
      };
    } catch (glmError) {
      fallbackReason = fallbackReason || "glm_error";
      (dependencies.logger ?? console).error(
        "[CHAT] GLM primary failed; falling back to OpenAI:",
        glmError
      );
    }
  } else {
    fallbackReason = "glm_unavailable";
  }

  const fallbackMessages = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

  const client = dependencies.openai ?? getOpenAIClient();
  const fallbackModel = dependencies.openaiModel ?? getOpenAIChatModel();
  // GPT-5 models accept only the default temperature, so it is not sent here.
  const response = await client.chat.completions.create({
    model: fallbackModel,
    max_completion_tokens: maxTokens,
    messages: [{ role: "system", content: input.systemPrompt }, ...fallbackMessages],
  });

  const reply = (response.choices[0]?.message?.content ?? "").trim();
  if (!reply) {
    throw new Error("OpenAI returned an empty chat response");
  }

  return {
    content: reply,
    provider: "openai",
    model: fallbackModel,
    fallbackUsed: glmWasAttempted,
    fallbackReason,
    primaryProvider: "glm",
    primaryModel,
    primaryConfigured,
  };
}
