import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
    windowMs: number; // Time window in milliseconds
    maxRequests: number; // Max requests per window
}

export function rateLimit(config: RateLimitConfig) {
    const { windowMs, maxRequests } = config;

    return async (req: NextRequest) => {
        const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
        const now = Date.now();
        const key = `${ip}:${req.nextUrl.pathname}`;

        const record = rateLimitMap.get(key);

        if (!record || now > record.resetTime) {
            // Create new record or reset expired one
            rateLimitMap.set(key, {
                count: 1,
                resetTime: now + windowMs,
            });
            return null; // Allow request
        }

        if (record.count >= maxRequests) {
            // Rate limit exceeded
            const retryAfter = Math.ceil((record.resetTime - now) / 1000);
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
                        "X-RateLimit-Reset": new Date(record.resetTime).toISOString(),
                    },
                }
            );
        }

        // Increment count
        record.count++;
        rateLimitMap.set(key, record);

        return null; // Allow request
    };
}

// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
        if (now > record.resetTime) {
            rateLimitMap.delete(key);
        }
    }
}, 60000); // Cleanup every minute
