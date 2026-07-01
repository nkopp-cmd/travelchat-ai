import Anthropic from "@anthropic-ai/sdk";

import { getTrimmedEnv, readGLMProviderConfig } from "./env";
import { GLMProvider } from "./providers/glm";
import type { TextGenerationProvider } from "./providers/base";

export type ChatProviderName = "glm" | "anthropic";
export type ChatFallbackReason =
  | "glm_unavailable"
  | "glm_error"
  | "glm_empty_response"
  | null;

export interface ChatMessage {
  role: string;
  content: string;
}

interface AnthropicChatClient {
  messages: {
    create(input: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
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
  anthropic?: AnthropicChatClient;
  anthropicModel?: string;
  logger?: Pick<Console, "error">;
}

export const DEFAULT_ANTHROPIC_CHAT_MODEL = "claude-sonnet-4-20250514";

export function getAnthropicChatModel(): string {
  return (
    getTrimmedEnv("CLAUDE_MODEL") ||
    getTrimmedEnv("ANTHROPIC_MODEL") ||
    getTrimmedEnv("CHAT_MODEL") ||
    DEFAULT_ANTHROPIC_CHAT_MODEL
  );
}

export function buildChatTranscript(messages: ChatMessage[]): string {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role === "assistant" ? "Alley" : "User"}: ${message.content}`)
    .join("\n\n");
}

function getAnthropicClient(): AnthropicChatClient {
  const apiKey = getTrimmedEnv("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("Anthropic API key is not configured");
  }

  return new Anthropic({ apiKey });
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
  let glmWasAttempted = false;
  let fallbackReason: ChatFallbackReason = null;

  if (glm.isAvailable()) {
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
        primaryConfigured: true,
      };
    } catch (glmError) {
      fallbackReason = fallbackReason || "glm_error";
      (dependencies.logger ?? console).error(
        "[CHAT] GLM primary failed; falling back to Anthropic:",
        glmError
      );
    }
  } else {
    fallbackReason = "glm_unavailable";
  }

  const anthropicMessages = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

  const client = dependencies.anthropic ?? getAnthropicClient();
  const fallbackModel = dependencies.anthropicModel ?? getAnthropicChatModel();
  const response = await client.messages.create({
    model: fallbackModel,
    max_tokens: maxTokens,
    system: input.systemPrompt,
    messages: anthropicMessages,
  });

  const reply = response.content[0]?.type === "text" ? response.content[0].text || "" : "";

  return {
    content: reply,
    provider: "anthropic",
    model: fallbackModel,
    fallbackUsed: glmWasAttempted,
    fallbackReason,
    primaryProvider: "glm",
    primaryModel,
    primaryConfigured: glmWasAttempted,
  };
}
