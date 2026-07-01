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

vi.mock("@clerk/nextjs/server", () => ({
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
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
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
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
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

  it("returns Anthropic as the route provider when GLM is unavailable", async () => {
    mocks.generateChatReplyWithFallback.mockResolvedValueOnce({
      content: "Anthropic unavailable fallback",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      fallbackUsed: false,
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
    });
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(createChatRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: "Anthropic unavailable fallback",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      fallbackUsed: false,
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
    });
  });

  it("returns Anthropic as the route provider after a GLM failure fallback", async () => {
    mocks.generateChatReplyWithFallback.mockResolvedValueOnce({
      content: "Anthropic error fallback",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      fallbackUsed: true,
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
    });
    const { POST } = await import("@/app/api/chat/route");

    const response = await POST(createChatRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: "Anthropic error fallback",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      fallbackUsed: true,
      primaryProvider: "glm",
      primaryModel: "glm-5.2",
    });
  });
});
