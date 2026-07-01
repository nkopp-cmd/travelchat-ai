import { describe, expect, it, vi } from "vitest";

import {
  buildChatTranscript,
  generateChatReplyWithFallback,
  getAnthropicChatModel,
  type ChatMessage,
} from "@/lib/llm/chat-provider";

const baseMessages: ChatMessage[] = [
  { role: "system", content: "Ignore me in transcript" },
  { role: "user", content: "Plan Seoul" },
  { role: "assistant", content: "What vibe?" },
  { role: "user", content: "Local food" },
];

function createAnthropicReply(text: string) {
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: "text", text }],
      })),
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
    const anthropic = createAnthropicReply("Claude reply");

    const result = await generateChatReplyWithFallback(
      {
        systemPrompt: "You are Alley",
        messages: baseMessages,
      },
      { glm, anthropic }
    );

    expect(result).toEqual({
      content: "GLM reply",
      provider: "glm",
      fallbackUsed: false,
    });
    expect(glm.generateText).toHaveBeenCalledWith({
      systemPrompt: "You are Alley",
      userPrompt: "User: Plan Seoul\n\nAlley: What vibe?\n\nUser: Local food",
      maxTokens: 2048,
      temperature: 0.7,
    });
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it("falls back to Anthropic when GLM is unavailable", async () => {
    const glm = {
      isAvailable: vi.fn(() => false),
      generateText: vi.fn(),
    };
    const anthropic = createAnthropicReply("Claude fallback");

    const result = await generateChatReplyWithFallback(
      {
        systemPrompt: "You are Alley",
        messages: baseMessages,
        maxTokens: 512,
        temperature: 0.2,
      },
      { glm, anthropic, anthropicModel: "claude-test" }
    );

    expect(result).toEqual({
      content: "Claude fallback",
      provider: "anthropic",
      fallbackUsed: false,
    });
    expect(glm.generateText).not.toHaveBeenCalled();
    expect(anthropic.messages.create).toHaveBeenCalledWith({
      model: "claude-test",
      max_tokens: 512,
      system: "You are Alley",
      messages: [
        { role: "user", content: "Plan Seoul" },
        { role: "assistant", content: "What vibe?" },
        { role: "user", content: "Local food" },
      ],
    });
  });

  it("falls back to Anthropic when GLM errors", async () => {
    const glm = {
      isAvailable: vi.fn(() => true),
      generateText: vi.fn(async () => {
        throw new Error("temporary GLM outage");
      }),
    };
    const anthropic = createAnthropicReply("Claude after GLM failure");
    const logger = { error: vi.fn() };

    const result = await generateChatReplyWithFallback(
      {
        systemPrompt: "You are Alley",
        messages: baseMessages,
      },
      { glm, anthropic, logger }
    );

    expect(result).toEqual({
      content: "Claude after GLM failure",
      provider: "anthropic",
      fallbackUsed: true,
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(anthropic.messages.create).toHaveBeenCalledOnce();
  });

  it("falls back to Anthropic when GLM returns an empty response", async () => {
    const glm = {
      isAvailable: vi.fn(() => true),
      generateText: vi.fn(async () => ({
        content: "   ",
        usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
        latencyMs: 10,
        provider: "glm" as const,
      })),
    };
    const anthropic = createAnthropicReply("Claude after empty GLM");
    const logger = { error: vi.fn() };

    const result = await generateChatReplyWithFallback(
      {
        systemPrompt: "You are Alley",
        messages: baseMessages,
      },
      { glm, anthropic, logger }
    );

    expect(result).toEqual({
      content: "Claude after empty GLM",
      provider: "anthropic",
      fallbackUsed: true,
    });
    expect(logger.error).toHaveBeenCalledOnce();
    expect(anthropic.messages.create).toHaveBeenCalledOnce();
  });

  it("uses the current chat fallback model env precedence", () => {
    process.env.CLAUDE_MODEL = " claude-primary ";
    process.env.ANTHROPIC_MODEL = "claude-secondary";
    process.env.CHAT_MODEL = "claude-legacy";

    expect(getAnthropicChatModel()).toBe("claude-primary");

    delete process.env.CLAUDE_MODEL;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.CHAT_MODEL;
  });
});
