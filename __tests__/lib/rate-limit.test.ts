import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  redis: vi.fn(),
  ratelimit: vi.fn(),
  slidingWindow: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: class Redis {
    constructor(options: unknown) {
      mocks.redis(options);
      return {};
    }
  },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow(...args: unknown[]) {
      return mocks.slidingWindow(...args);
    }

    constructor(options: unknown) {
      mocks.ratelimit(options);
      return { limit: mocks.limit };
    }
  }

  return { Ratelimit };
});

function createRequest(ip: string) {
  return new NextRequest("https://www.localley.io/api/spots/social-submissions", {
    headers: {
      "x-forwarded-for": ip,
    },
  });
}

describe("rateLimit", () => {
  const originalEnv = {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    mocks.redis.mockReturnValue({});
    mocks.ratelimit.mockReturnValue({ limit: mocks.limit });
    mocks.slidingWindow.mockReturnValue("window");
  });

  afterEach(() => {
    if (originalEnv.url === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalEnv.url;
    }

    if (originalEnv.token === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalEnv.token;
    }
  });

  it("uses the in-memory fallback when Upstash rate limiting fails", async () => {
    mocks.limit.mockRejectedValueOnce(new TypeError("fetch failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rateLimit } = await import("@/lib/rate-limit");
    const limiter = rateLimit({ windowMs: 60_000, maxRequests: 2 });

    const response = await limiter(createRequest("203.0.113.41"));

    expect(response).toBeNull();
    expect(mocks.limit).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "[rate-limit] Upstash limiter failed; using in-memory fallback.",
      expect.any(TypeError),
    );

    warn.mockRestore();
  });
});
