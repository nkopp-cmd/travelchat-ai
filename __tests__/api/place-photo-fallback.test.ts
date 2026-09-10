import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/places/photo/route";

const mocks = vi.hoisted(() => ({ limit: vi.fn(), productionLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => mocks.limit }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
    static slidingWindow = vi.fn();
    limit = mocks.productionLimit;
} }));

const name = "places/ChIJabc/photos/fresh";
const cdn = "https://lh3.googleusercontent.com/photo";
const request = (query = `name=${encodeURIComponent(name)}`) => new NextRequest(`https://localley.io/api/places/photo?${query}`);
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("place photo proxy without substitution", () => {
    beforeEach(() => {
        vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
        vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
        mocks.limit.mockReset().mockResolvedValue(null);
        mocks.productionLimit.mockReset().mockResolvedValue({ success: true });
        vi.stubGlobal("fetch", vi.fn());
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

    it("does not fetch stock when the key is missing", async () => {
        vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
        const response = await GET(request(`name=${name}&fallback=https://images.unsplash.com/photo`));
        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(["", "name=places/abc/photos/../x", "name=places/abc/photos/a%3Fkey=x", "ref=a%26key=x",
        "name=places/abc/photos/x&ref=abc", "name=places/abc/photos/x&name=places/abc/photos/y", `ref=${"x".repeat(4097)}`])(
        "rejects invalid input: %s", async query => {
            expect((await GET(request(query))).status).toBe(400);
            expect(fetch).not.toHaveBeenCalled();
        },
    );

    it("returns magic-byte JPEG with clamped width and header authentication", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(Response.json({ photoUri: cdn }))
            .mockResolvedValueOnce(new Response(jpeg, { headers: { "Content-Type": "text/html;charset=UTF-8" } }));
        const response = await GET(request(`name=${name}&w=99999&v=venue-photos-2`));
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/jpeg");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(fetch).toHaveBeenNthCalledWith(1,
            `https://places.googleapis.com/v1/${name}/media?maxWidthPx=1600&skipHttpRedirect=true`,
            expect.objectContaining({ cache: "no-store", redirect: "manual", headers: { "X-Goog-Api-Key": "test-key" } }));
        expect(fetch).toHaveBeenNthCalledWith(2, cdn, expect.objectContaining({ cache: "no-store", redirect: "manual" }));
    });

    it.each([400, 403, 404, 429, 500])("never replaces a denied or expired photo (%s)", async status => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response("secret upstream body", { status }));
        const response = await GET(request(`name=${name}&fallback=https://images.pexels.com/stock.jpg`));
        expect(response.status).toBe(status === 404 ? 404 : 502);
        expect(await response.text()).toBe("Place photo unavailable");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each(["https://evil.test/image", "http://lh3.googleusercontent.com/image", "https://lh3.googleusercontent.com.evil.test/image",
        "https://user:password@lh3.googleusercontent.com/image", "https://lh3.googleusercontent.com:8443/image", "http://127.0.0.1/image"])(
        "rejects untrusted media URL %s", async photoUri => {
            vi.mocked(fetch).mockResolvedValueOnce(Response.json({ photoUri }));
            expect((await GET(request())).status).toBe(502);
            expect(fetch).toHaveBeenCalledTimes(1);
        },
    );

    it("checks every redirect before fetching", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(Response.json({ photoUri: cdn }))
            .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.test/image" } }));
        expect((await GET(request())).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("allows two verified CDN redirects, then stops", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(Response.json({ photoUri: cdn }))
            .mockImplementation(async () => new Response(null, { status: 302, headers: { location: "https://lh3.ggpht.com/next" } }));
        expect((await GET(request())).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    it("still serves a valid legacy ref without forwarding credentials to the CDN", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: cdn } }))
            .mockResolvedValueOnce(new Response(jpeg));
        expect((await GET(request("ref=legacy_ref&w=1&fallback=https://evil.test"))).status).toBe(200);
        expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining("maxwidth=240&photo_reference=legacy_ref&key=test-key"),
            expect.objectContaining({ cache: "no-store", redirect: "manual" }));
        expect(vi.mocked(fetch).mock.calls[1][1]).not.toHaveProperty("headers");
    });

    it("does not follow a Location header on a denied legacy response", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403, headers: { location: cdn } }));
        expect((await GET(request("ref=legacy"))).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("counts the legacy lookup redirect toward the two-redirect limit", async () => {
        vi.mocked(fetch).mockImplementation(async () => new Response(null, { status: 302, headers: { location: cdn } }));
        expect((await GET(request("ref=legacy"))).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it.each(["<svg xmlns='http://www.w3.org/2000/svg'></svg>", "<html>not a photo</html>"])("rejects non-image bytes", async body => {
        vi.mocked(fetch).mockResolvedValueOnce(Response.json({ photoUri: cdn }))
            .mockResolvedValueOnce(new Response(body, { headers: { "content-type": "image/jpeg" } }));
        expect((await GET(request())).status).toBe(502);
    });

    it.each([
        ["image/png", [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]],
        ["image/webp", Array.from(new TextEncoder().encode("RIFF0000WEBP0000"))],
        ["image/gif", Array.from(new TextEncoder().encode("GIF89a000000"))],
        ["image/avif", [0, 0, 0, 16, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0]],
    ] as const)("allows browser format %s", async (type, bytes) => {
        vi.mocked(fetch).mockResolvedValueOnce(Response.json({ photoUri: cdn }))
            .mockResolvedValueOnce(new Response(new Uint8Array(bytes)));
        expect((await GET(request())).headers.get("content-type")).toBe(type);
    });

    it.each([true, false])("rejects oversized images (declared: %s)", async declared => {
        vi.mocked(fetch).mockResolvedValueOnce(Response.json({ photoUri: cdn }))
            .mockResolvedValueOnce(new Response(declared ? jpeg : new Uint8Array(10 * 1024 * 1024 + 1),
                { headers: declared ? { "content-length": String(10 * 1024 * 1024 + 1) } : {} }));
        expect((await GET(request())).status).toBe(502);
    });

    it.each(["not json", "null", JSON.stringify({ photoUri: "x".repeat(256 * 1024) })])("rejects malformed or oversized metadata", async body => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(body));
        expect((await GET(request())).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("aborts a provider timeout", async () => {
        vi.useFakeTimers();
        vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }));
        const pending = GET(request());
        await vi.advanceTimersByTimeAsync(12_000);
        expect((await pending).status).toBe(504);
    });

    it("enforces the development limit before fetching", async () => {
        mocks.limit.mockResolvedValue(new Response(null, { status: 429 }));
        expect((await GET(request())).status).toBe(429);
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        ["203.0.113.10", "203.0.113.10"],
        ["2001:db8::1234", "2001:db8::1234"],
        [null, "unknown"],
        ["", "unknown"],
        ["not-an-ip", "unknown"],
        ["999.0.0.1", "unknown"],
        ["203.0.113.10, 198.51.100.1", "unknown"],
        ["203.0.113.10:443", "unknown"],
        ["[2001:db8::1234]", "unknown"],
    ])("uses only a validated Vercel IP in production: %s", async (platformIp, expectedKey) => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
        mocks.productionLimit.mockResolvedValue({ success: false });
        for (const spoofedIp of ["198.51.100.1", "198.51.100.2"]) {
            const req = request();
            if (platformIp !== null) req.headers.set("x-vercel-forwarded-for", platformIp);
            req.headers.set("x-forwarded-for", `${spoofedIp}, 192.0.2.1`);
            req.headers.set("x-real-ip", spoofedIp);
            expect((await GET(req)).status).toBe(429);
        }
        expect(mocks.productionLimit.mock.calls).toEqual([[expectedKey], [expectedKey]]);
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(["missing", "error", "timeout", "denied"])("fails closed in production: %s", async mode => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("UPSTASH_REDIS_REST_URL", mode === "missing" ? "" : "https://redis.example");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
        if (mode === "error") mocks.productionLimit.mockRejectedValue(new Error("unavailable"));
        if (mode === "timeout") mocks.productionLimit.mockResolvedValue({ success: true, reason: "timeout" });
        if (mode === "denied") mocks.productionLimit.mockResolvedValue({ success: false });
        expect((await GET(request())).status).toBe(mode === "denied" ? 429 : mode === "error" ? 502 : 503);
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
});
