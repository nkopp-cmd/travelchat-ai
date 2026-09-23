import { describe, expect, it, vi } from "vitest";

import {
  buildChatTranscript,
  generateChatReplyWithFallback,
  getOpenAIChatModel,
  type ChatMessage,
} from "@/lib/llm/chat-provider";

const baseMessages: ChatMessage[] = [
  { role: "system", content: "Ignore me in transcript" },
  { role: "user", content: "Plan Seoul" },
  { role: "assistant", content: "What vibe?" },
  { role: "user", content: "Local food" },
];
const primaryModel = process.env.GLM_MODEL?.trim() || "glm-5.2";

function createOpenAIReply(text: string | null) {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: text } }],
        })),
      },
    },
  };
}

describe("chat provider fallback", () => {
  it("builds a clean transcript for GLM without system messages", () => {
    expect(buildChatTranscript(baseMessages)).toBe(
      "User: Plan Seoul\n\nAlley: What vibe?\n\nUser: Local food"
    );
  });

  it("uses GLM as the primary chat provider when available", async () => {
    const glm = {
      isAvailable: vi.fn(() => true),
      generateText: vi.fn(async () => ({
        content: "GLM reply",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        latencyMs: 10,
        provider: "glm" as const,
      })),
    };
    const openai = createOpenAIReply("OpenAI reply");

    const result = await generateChatReplyWithFallback(
      {
        systemPrompt: "You are Alley",
        messages: baseMessages,
      },
      { glm, openai }
    );

    expect(result).toEqual({
      content: "GLM reply",
      provider: "glm",
      model: primaryModel,
      fallbackUsed: false,
      fallbackReason: null,
      primaryProvider: "glm",
      primaryModel,
      primaryConfigured: true,
    });
    expect(glm.generateText).toHaveBeenCalledWith({
      systemPrompt: "You are Alley",
      userPrompt: "User: Plan Seoul\n\nAlley: What vibe?\n\nUser: Local food",
      maxTokens: 2048,
      temperature: 0.7,
    });
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when GLM is unavailable", async () => {
    const glm = {
      isAvailable: vi.fn(() => false),
      generateText: vi.fn(),
    };
    const openai = createOpenAIReply("OpenAI fallback");

    const result = await generateChatReplyWithFallback(
      {
        systemPrompt: "You are Alley",
        messages: baseMessages,
        maxTokens: 512,
        temperature: 0.2,
      },
      { glm, openai, openaiModel: "gpt-test" }
    );

    expect(result).toEqual({
      content: "OpenAI fallback",
      provider: "openai",
      model: "gpt-test",
      fallbackUsed: false,
      fallbackReason: "glm_unavailable",
      primaryProvider: "glm",
      primaryModel,
      primaryConfigured: false,
    });
    expect(glm.generateText).not.toHaveBeenCalled();
    expect(openai.chat.completions.create).toHaveBeenCalledWith({
      model: "gpt-test",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: "You are Alley" },
        { role: "user", content: "Plan Seoul" },
        { role: "assistant", content: "What vibe?" },
        { role: "user", content: "Local food" },
      ],
    });
  });

  it("falls back to OpenAI when GLM errors", async () => {
    const glm = {
      isAvailable: vi.fn(() => true),
      generateText: vi.fn(async () => {
        throw new Error("temporary GLM outage");
      }),
    };
    const openai = createOpenAIReply("OpenAI after GLM failure");
    const logger = { error: vi.fn() };

    const result = await generateChatReplyWithFallback(
      {
        systemPrompt: "You are Alley",
        messages: baseMessages,
      },
      { glm, openai, logger }
    );

    expect(result).toEqual({
      content: "OpenAI after GLM failure",
      provider: "openai",
      model: "gpt-5.6-luna",
      fallbackUsed: true,
      fallbackReason: "glm_error",
      primaryProvider: "glm",
      primaryModel,
      primaryConfigured: true,
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
  });

  it("throws when the OpenAI fallback returns no usable text", async () => {
    const glm = {
      isAvailable: vi.fn(() => false),
      generateText: vi.fn(),
    };
    const openai = createOpenAIReply("   ");

    await expect(
      generateChatReplyWithFallback(
        {
          systemPrompt: "You are Alley",
          messages: baseMessages,
        },
        { glm, openai }
      )
    ).rejects.toThrow("OpenAI returned an empty chat response");
  });

  it("falls back to OpenAI when GLM returns an empty response", async () => {
    const glm = {
      isAvailable: vi.fn(() => true),
      generateText: vi.fn(async () => ({
        content: "   ",
        usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
        latencyMs: 10,
        provider: "glm" as const,
      })),
    };
    const openai = createOpenAIReply("OpenAI after empty GLM");
    const logger = { error: vi.fn() };

    const result = await generateChatReplyWithFallback(
      {
        systemPrompt: "You are Alley",
        messages: baseMessages,
      },
      { glm, openai, logger }
    );

    expect(result).toEqual({
      content: "OpenAI after empty GLM",
      provider: "openai",
      model: "gpt-5.6-luna",
      fallbackUsed: true,
      fallbackReason: "glm_empty_response",
      primaryProvider: "glm",
      primaryModel,
      primaryConfigured: true,
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
  });

  it("reads the OpenAI chat fallback model from OPENAI_CHAT_MODEL", () => {
    process.env.OPENAI_CHAT_MODEL = " gpt-custom ";
    expect(getOpenAIChatModel()).toBe("gpt-custom");
    delete process.env.OPENAI_CHAT_MODEL;
    expect(getOpenAIChatModel()).toBe("gpt-5.6-luna");
  });
});
