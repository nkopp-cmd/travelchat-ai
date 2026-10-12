import OpenAI from "openai";

import { getTrimmedEnv, TEXT_MODEL } from "./env";
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
        reasoning_effort: "none";
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
  primaryProvider: "openai";
  primaryModel: string;
  primaryConfigured: boolean;
}

interface ChatProviderDependencies {
  glm?: Pick<TextGenerationProvider, "isAvailable" | "generateText">;
  openai?: OpenAIChatClient;
  openaiModel?: string;
  logger?: Pick<Console, "error">;
}

// One text model is used for production chat. No silent provider fallback.
export const DEFAULT_OPENAI_CHAT_MODEL = TEXT_MODEL;

export function getOpenAIChatModel(): string {
  return DEFAULT_OPENAI_CHAT_MODEL;
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
  const maxTokens = input.maxTokens ?? 2048;
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
    reasoning_effort: "none",
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
    fallbackUsed: false,
    fallbackReason: null,
    primaryProvider: "openai",
    primaryModel: fallbackModel,
    primaryConfigured: Boolean(dependencies.openai || getTrimmedEnv("OPENAI_API_KEY")),
  };
}
