import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { strictPlatformLimit } from "@/lib/rate-limit";

const contextSymbol = Symbol.for("__cloudflare-context__");
const globals = globalThis as Record<symbol, unknown>;

function withBinding(name: string, limit: (options: { key: string }) => Promise<{ success: boolean }>) {
    globals[contextSymbol] = { env: { [name]: { limit: vi.fn(limit) } } };
    return (globals[contextSymbol] as { env: Record<string, { limit: ReturnType<typeof vi.fn> }> }).env[name].limit;
}

function request(headers: Record<string, string> = {}) {
    return new NextRequest("https://www.localley.io/api/places/photo", { headers });
}

afterEach(() => { delete globals[contextSymbol]; });

describe("strictPlatformLimit", () => {
    it("fails closed without a Workers binding", async () => {
        expect(await strictPlatformLimit(request({ "cf-connecting-ip": "203.0.113.10" }), 120, "p")).toBe("unavailable");
    });

    it("fails closed when the binding throws", async () => {
        withBinding("RATE_LIMIT_120", async () => { throw new Error("down"); });
        expect(await strictPlatformLimit(request(), 120, "p")).toBe("unavailable");
    });

    it("maps binding results to ok and limited", async () => {
        withBinding("RATE_LIMIT_40", async () => ({ success: true }));
        expect(await strictPlatformLimit(request(), 40, "p")).toBe("ok");
        withBinding("RATE_LIMIT_40", async () => ({ success: false }));
        expect(await strictPlatformLimit(request(), 40, "p")).toBe("limited");
    });

    it.each([
        [undefined, "unknown"],
        ["203.0.113.10", "203.0.113.10"],
        ["2001:db8::1234", "2001:db8::1234"],
        ["not-an-ip", "unknown"],
        ["203.0.113.10, 198.51.100.1", "unknown"],
        ["203.0.113.10:443", "unknown"],
    ])("keys only by a valid cf-connecting-ip (%s) and ignores forwarding headers", async (cfIp, expected) => {
        const limit = withBinding("RATE_LIMIT_120", async () => ({ success: true }));
        const headers: Record<string, string> = { "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2", "x-vercel-forwarded-for": "198.51.100.3" };
        if (cfIp) headers["cf-connecting-ip"] = cfIp;
        await strictPlatformLimit(request(headers), 120, "venue_images_v2");
        expect(limit).toHaveBeenCalledWith({ key: `venue_images_v2:${expected}` });
    });
});
