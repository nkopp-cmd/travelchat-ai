import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
}

let redis: Redis | null = null;

function getRedisClient(): Redis | null {
    if (redis) return redis;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
        redis = new Redis({ url, token });
        return redis;
    }

    return null;
}

// Fallback in-memory rate limiter for development
const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

function inMemoryRateLimit(key: string, windowMs: number, maxRequests: number): {
    success: boolean;
    remaining: number;
    reset: Date;
} {
    const now = Date.now();
    cleanupInMemoryStore(now);
    const record = inMemoryStore.get(key);

    if (!record || now > record.resetTime) {
        inMemoryStore.set(key, { count: 1, resetTime: now + windowMs });
        return { success: true, remaining: maxRequests - 1, reset: new Date(now + windowMs) };
    }

    if (record.count >= maxRequests) {
        return { success: false, remaining: 0, reset: new Date(record.resetTime) };
    }

    record.count++;
    inMemoryStore.set(key, record);
    return { success: true, remaining: maxRequests - record.count, reset: new Date(record.resetTime) };
}

// Clean up expired in-memory entries lazily. A module-scope setInterval is not
// allowed in Cloudflare Workers global scope, so cleanup runs on use instead.
let lastCleanup = 0;
function cleanupInMemoryStore(now: number) {
    if (now - lastCleanup < 60000) return;
    lastCleanup = now;
    for (const [key, record] of inMemoryStore.entries()) {
        if (now > record.resetTime) {
            inMemoryStore.delete(key);
        }
    }
}

/**
 * Cloudflare Workers rate limiting binding (wrangler `ratelimits`).
 * Bindings are named RATE_LIMIT_<maxRequests> with a 60 second period.
 */
interface WorkersRateLimitBinding {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface WorkersRuntimeContext {
    env?: Record<string, unknown>;
}

const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

function getWorkersContext(): WorkersRuntimeContext | undefined {
    return (globalThis as Record<symbol, WorkersRuntimeContext | undefined>)[cloudflareContextSymbol];
}

function getWorkersRateLimiter(windowMs: number, maxRequests: number): WorkersRateLimitBinding | null {
    if (windowMs !== 60_000) return null;
    const binding = getWorkersContext()?.env?.[`RATE_LIMIT_${maxRequests}`] as WorkersRateLimitBinding | undefined;
    return binding && typeof binding.limit === "function" ? binding : null;
}

function getClientIp(req: NextRequest): string {
    // cf-connecting-ip is set by Cloudflare and cannot be spoofed on a Worker.
    // It is only trusted when the request runs inside the Workers runtime.
    const cfIp = getWorkersContext() ? req.headers.get("cf-connecting-ip") : null;
    return cfIp ||
        req.headers.get("x-forwarded-for")?.split(",")[0] ||
        req.headers.get("x-real-ip") ||
        "unknown";
}

export function rateLimit(config: RateLimitConfig) {
    const { windowMs, maxRequests } = config;
    const windowSeconds = Math.ceil(windowMs / 1000);

    const redisClient = getRedisClient();
    const upstashLimiter = redisClient
        ? new Ratelimit({
            redis: redisClient,
            limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
            analytics: true,
            prefix: "localley_ratelimit",
        })
        : null;

    return async (req: NextRequest) => {
        const ip = getClientIp(req);
        const key = `${ip}:${req.nextUrl.pathname}`;

        let success: boolean;
        let reset: Date;

        const workersLimiter = getWorkersRateLimiter(windowMs, maxRequests);

        if (workersLimiter) {
            try {
                const result = await workersLimiter.limit({ key });
                success = result.success;
                reset = new Date(Date.now() + windowMs);
            } catch (error) {
                console.warn("[rate-limit] Workers rate limit binding failed; using in-memory fallback.", error);
                const result = inMemoryRateLimit(key, windowMs, maxRequests);
                success = result.success;
                reset = result.reset;
            }
        } else if (upstashLimiter) {
            try {
                const result = await upstashLimiter.limit(key);
                success = result.success;
                reset = new Date(result.reset);
            } catch (error) {
                console.warn("[rate-limit] Upstash limiter failed; using in-memory fallback.", error);
                const result = inMemoryRateLimit(key, windowMs, maxRequests);
                success = result.success;
                reset = result.reset;
            }
        } else {
            const result = inMemoryRateLimit(key, windowMs, maxRequests);
            success = result.success;
            reset = result.reset;
        }

        if (!success) {
            const retryAfter = Math.ceil((reset.getTime() - Date.now()) / 1000);
            return NextResponse.json(
                {
                    error: "Too many requests",
                    message: "Rate limit exceeded. Please try again later.",
                    retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": retryAfter.toString(),
                        "X-RateLimit-Limit": maxRequests.toString(),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": reset.toISOString(),
                    },
                }
            );
        }

        return null;
    };
}

export const rateLimiters = {
    strict: rateLimit({ windowMs: 60 * 1000, maxRequests: 5 }),
    standard: rateLimit({ windowMs: 60 * 1000, maxRequests: 20 }),
    relaxed: rateLimit({ windowMs: 60 * 1000, maxRequests: 60 }),
}
