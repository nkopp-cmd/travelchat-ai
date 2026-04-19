import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, isApiError } from "@/lib/api-client";

describe("ApiClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("extracts nested standardized API error messages", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "rate_limited",
            message: "Rate limit exceeded. Please try again later.",
          },
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      )
    ) as typeof fetch;

    const client = new ApiClient();
    const result = await client.sendChatMessage([{ role: "user", content: "Hello" }]);

    expect(isApiError(result)).toBe(true);
    if (!isApiError(result)) {
      throw new Error("Expected ApiError result");
    }

    expect(result.error).toBe("Rate limit exceeded. Please try again later.");
    expect(result.message).toBe("Rate limit exceeded. Please try again later.");
    expect(result.code).toBe("rate_limited");
    expect(result.status).toBe(429);
  });

  it("keeps legacy flat error payloads working", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Too many requests",
          message: "Rate limit exceeded. Please try again later.",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      )
    ) as typeof fetch;

    const client = new ApiClient();
    const result = await client.sendChatMessage([{ role: "user", content: "Hello" }]);

    expect(isApiError(result)).toBe(true);
    if (!isApiError(result)) {
      throw new Error("Expected ApiError result");
    }

    expect(result.error).toBe("Rate limit exceeded. Please try again later.");
    expect(result.message).toBe("Rate limit exceeded. Please try again later.");
    expect(result.status).toBe(429);
  });
});
