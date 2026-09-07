// @vitest-environment node
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { GET } from "@/app/api/itineraries/[id]/story/route";

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    single: vi.fn(),
    select: vi.fn(),
    download: vi.fn(),
    storageFrom: vi.fn(),
    admin: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));

const fixture = {
    id: "story-fixture",
    clerk_user_id: "owner",
    is_public: true,
    title: "Seoul Weekend",
    city: "Seoul",
    days: 1,
    activities: [],
    highlights: [],
    ai_backgrounds: null,
};

function request(query = "") {
    return GET(new NextRequest(`https://localley.io/api/itineraries/story-fixture/story?${query}`), {
        params: Promise.resolve({ id: fixture.id }),
    });
}

beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.single.mockResolvedValue({ data: { ...fixture }, error: null });
    mocks.select.mockReturnValue({ eq: vi.fn(() => ({ single: mocks.single })) });
    mocks.storageFrom.mockReturnValue({ download: mocks.download });
    mocks.admin.mockReturnValue({
        from: vi.fn(() => ({ select: mocks.select })),
        storage: { from: mocks.storageFrom },
    });
    // Real next/og and Satori, with local emoji artwork instead of network access.
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("https://cdn.jsdelivr.net/") && url.endsWith(".svg")) {
            return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="14" fill="gold"/></svg>', {
                headers: { "Content-Type": "image/svg+xml" },
            });
        }
        throw new Error(`Unexpected network access: ${url}`);
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("story rendering with real ImageResponse", () => {
    it.each(["cover", "day", "summary"])("renders the full %s template without the error fallback", async (slide) => {
        const debug = await request(`slide=${slide}&debug=true`);
        const diagnostics = await debug.json();
        expect(diagnostics, JSON.stringify(diagnostics)).toMatchObject({ step: "render_success" });
        const response = await request(`slide=${slide}`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        const bytes = Buffer.from(await response.arrayBuffer());
        const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
        expect(info).toMatchObject({ width: 1080, height: 1920 });
        expect(bytes.byteLength).toBe(diagnostics.pngBytes);
        // The full template has a white logo near the top; the error slide centers it.
        const logo = await sharp(bytes).extract({ left: 420, top: 210, width: 240, height: 65 }).stats();
        expect(logo.channels.slice(0, 3).every((channel) => channel.max > 235)).toBe(true);
        expect(mocks.select).toHaveBeenCalledWith("*");
        expect(mocks.storageFrom).not.toHaveBeenCalled();
    }, 30000);
});

describe("story access", () => {
    it.each([null, "other-user"])("hides private stories from %s before downloads or rendering", async (userId) => {
        mocks.auth.mockResolvedValue({ userId });
        mocks.single.mockResolvedValue({
            data: { ...fixture, is_public: false, ai_backgrounds: {
                cover: "https://fixture.supabase.co/storage/v1/object/public/generated-images/private.png",
            } },
            error: null,
        });
        const render = vi.spyOn(ImageResponse.prototype, "arrayBuffer");
        for (const query of ["", "debug=true", "paid=true&debug=true"]) {
            const response = await request(query);
            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ error: "Itinerary not found" });
            expect(response.headers.get("cache-control")).toBe("private, no-store");
        }
        expect(fetch).not.toHaveBeenCalled();
        expect(mocks.storageFrom).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
    });

    it.each([undefined, null, "true", 1])("requires literal public=true, not %s", async (is_public) => {
        mocks.single.mockResolvedValue({ data: { ...fixture, is_public, clerk_user_id: null }, error: null });
        const response = await request("debug=true");
        expect(response.status).toBe(404);
        expect(fetch).not.toHaveBeenCalled();
        expect(mocks.storageFrom).not.toHaveBeenCalled();
    });

    it("returns the same 404 for missing and inaccessible stories", async () => {
        mocks.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
        const response = await request("debug=true");
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "Itinerary not found" });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("allows the verified owner and prevents caching of private PNGs and diagnostics", async () => {
        mocks.auth.mockResolvedValue({ userId: "owner" });
        mocks.single.mockResolvedValue({ data: { ...fixture, is_public: false }, error: null });
        const debug = await request("slide=day&debug=true");
        expect(debug.status).toBe(200);
        expect(debug.headers.get("cache-control")).toBe("private, no-store");
        expect(await debug.json()).toMatchObject({ step: "render_success" });
        const response = await request("slide=day");
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 1080, height: 1920 });
    }, 30000);

    it.each(["", "paid=true"])("keeps published stories anonymous and uncached (%s)", async (query) => {
        const response = await request(`slide=day&debug=true&${query}`);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
        expect(await response.json()).toMatchObject({ step: "render_success", params: { isPaidUser: query !== "" } });
    }, 30000);

    it("keeps private render failures and the shipped PNG fallback uncached", async () => {
        mocks.auth.mockResolvedValue({ userId: "owner" });
        mocks.single.mockResolvedValue({ data: { ...fixture, is_public: false }, error: null });
        const render = vi.spyOn(ImageResponse.prototype, "arrayBuffer");
        render.mockRejectedValueOnce(new Error("Fixture render failure"));
        const debug = await request("slide=day&debug=true");
        expect(debug.headers.get("cache-control")).toBe("private, no-store");
        expect(await debug.json()).toMatchObject({ step: "render_failed", error: { message: "Fixture render failure" } });
        render.mockRejectedValueOnce(new Error("Fixture render failure"));
        const response = await request("slide=day");
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 1080, height: 1920 });
    }, 30000);

    it.each(["auth", "database", "database-throw"])("fails closed on unexpected %s errors, including debug", async (failure) => {
        if (failure === "auth") mocks.auth.mockRejectedValue(new Error("Auth unavailable"));
        else if (failure === "database-throw") mocks.single.mockRejectedValue(new Error("Database unavailable"));
        else mocks.single.mockResolvedValue({ data: fixture, error: { code: "42501", message: "Database unavailable" } });
        const render = vi.spyOn(ImageResponse.prototype, "arrayBuffer");
        for (const query of ["", "debug=true"]) {
            const response = await request(query);
            expect(response.status).toBe(500);
            expect(response.headers.get("cache-control")).toBe("private, no-store");
            expect(await response.json()).toEqual({ error: "Failed to load story" });
        }
        expect(fetch).not.toHaveBeenCalled();
        expect(mocks.storageFrom).not.toHaveBeenCalled();
        expect(render).not.toHaveBeenCalled();
        if (failure === "auth") expect(mocks.admin).not.toHaveBeenCalled();
    });
});
