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

  describe("Cloudflare Workers binding", () => {
    const contextSymbol = Symbol.for("__cloudflare-context__");
    const globals = globalThis as Record<symbol, unknown>;

    afterEach(() => {
      delete globals[contextSymbol];
    });

    function installBinding(limit: ReturnType<typeof vi.fn>, name = "RATE_LIMIT_2") {
      globals[contextSymbol] = { env: { [name]: { limit } } };
    }

    it("prefers the Workers binding over Upstash and keys by cf-connecting-ip", async () => {
      const bindingLimit = vi.fn().mockResolvedValue({ success: true });
      installBinding(bindingLimit);

      const { rateLimit } = await import("@/lib/rate-limit");
      const limiter = rateLimit({ windowMs: 60_000, maxRequests: 2 });
      const request = new NextRequest("https://www.localley.io/api/chat", {
        headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9" },
      });

      expect(await limiter(request)).toBeNull();
      expect(bindingLimit).toHaveBeenCalledWith({ key: "198.51.100.7:/api/chat" });
      expect(mocks.limit).not.toHaveBeenCalled();
    });

    it("returns 429 when the Workers binding rejects the request", async () => {
      installBinding(vi.fn().mockResolvedValue({ success: false }));

      const { rateLimit } = await import("@/lib/rate-limit");
      const response = await rateLimit({ windowMs: 60_000, maxRequests: 2 })(createRequest("203.0.113.42"));

      expect(response?.status).toBe(429);
      expect(response?.headers.get("X-RateLimit-Limit")).toBe("2");
    });

    it("falls back to memory when the Workers binding throws", async () => {
      installBinding(vi.fn().mockRejectedValue(new Error("binding down")));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const { rateLimit } = await import("@/lib/rate-limit");
      const response = await rateLimit({ windowMs: 60_000, maxRequests: 2 })(createRequest("203.0.113.43"));

      expect(response).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        "[rate-limit] Workers rate limit binding failed; using in-memory fallback.",
        expect.any(Error),
      );
      warn.mockRestore();
    });

    it("ignores the binding for windows other than 60 seconds", async () => {
      const bindingLimit = vi.fn();
      installBinding(bindingLimit);
      mocks.limit.mockResolvedValueOnce({ success: true, reset: Date.now() + 10_000 });

      const { rateLimit } = await import("@/lib/rate-limit");
      await rateLimit({ windowMs: 10_000, maxRequests: 2 })(createRequest("203.0.113.44"));

      expect(bindingLimit).not.toHaveBeenCalled();
      expect(mocks.limit).toHaveBeenCalledOnce();
    });

    it("does not trust cf-connecting-ip outside the Workers runtime", async () => {
      mocks.limit.mockResolvedValueOnce({ success: true, reset: Date.now() + 60_000 });

      const { rateLimit } = await import("@/lib/rate-limit");
      const request = new NextRequest("https://www.localley.io/api/chat", {
        headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9" },
      });
      await rateLimit({ windowMs: 60_000, maxRequests: 2 })(request);

      expect(mocks.limit).toHaveBeenCalledWith("203.0.113.9:/api/chat");
    });
  });
});
