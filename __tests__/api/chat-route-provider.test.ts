import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_test" })),
  rateLimitHandler: vi.fn(async () => null),
  checkAndIncrementUsage: vi.fn(async () => ({
    allowed: true,
    usage: {
      currentUsage: 1,
      limit: 100,
      remaining: 99,
      periodType: "daily",
      periodResetAt: "2026-07-02",
    },
    tier: "pro",
  })),
  generateChatReplyWithFallback: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => mocks.rateLimitHandler),
}));

vi.mock("@/lib/usage-tracking", () => ({
  checkAndIncrementUsage: mocks.checkAndIncrementUsage,
}));

vi.mock("@/lib/llm/chat-provider", () => ({
  generateChatReplyWithFallback: mocks.generateChatReplyWithFallback,
}));

function createChatRequest() {
  return new NextRequest("https://www.localley.io/api/chat", {
    method: "POST",
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: "Can you help me plan something local-first?",
        },
      ],
    }),
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("/api/chat provider routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns GLM as the route provider when the primary chat model succeeds", async () => {
    mocks.generateChatReplyWithFallback.mockResolvedValueOnce({
      content: "GLM route reply",
      provider: "glm",
      model: "glm-5.2",
      fallbackUsed: false,
      fallbackReason: null,
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
      primaryConfigured: true,
    });
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(createChatRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: "GLM route reply",
      provider: "glm",
      model: "glm-5.2",
      fallbackUsed: false,
      fallbackReason: null,
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
      primaryConfigured: true,
    });
    expect(mocks.generateChatReplyWithFallback).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining("ASK FOR CITY FIRST"),
      messages: [
        {
          role: "user",
          content: "Can you help me plan something local-first?",
        },
      ],
      maxTokens: 2048,
      temperature: 0.7,
    });
  });

  it("returns OpenAI as the route provider when GLM is unavailable", async () => {
    mocks.generateChatReplyWithFallback.mockResolvedValueOnce({
      content: "OpenAI unavailable fallback",
      provider: "openai",
      model: "gpt-5.6-luna",
      fallbackUsed: false,
      fallbackReason: "glm_unavailable",
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
      primaryConfigured: false,
    });
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(createChatRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: "OpenAI unavailable fallback",
      provider: "openai",
      model: "gpt-5.6-luna",
      fallbackUsed: false,
      fallbackReason: "glm_unavailable",
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
      primaryConfigured: false,
    });
  });

  it("returns OpenAI as the route provider after a GLM failure fallback", async () => {
    mocks.generateChatReplyWithFallback.mockResolvedValueOnce({
      content: "OpenAI error fallback",
      provider: "openai",
      model: "gpt-5.6-luna",
      fallbackUsed: true,
      fallbackReason: "glm_error",
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
      primaryConfigured: true,
    });
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(createChatRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: "OpenAI error fallback",
      provider: "openai",
      model: "gpt-5.6-luna",
      fallbackUsed: true,
      fallbackReason: "glm_error",
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
      primaryConfigured: true,
    });
  });
});
