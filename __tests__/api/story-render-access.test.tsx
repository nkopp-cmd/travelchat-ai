// @vitest-environment node
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { GET } from "@/app/api/itineraries/[id]/story/route";

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    reader: vi.fn(),
    first: vi.fn(),
    single: vi.fn(),
    select: vi.fn(),
    download: vi.fn(),
    storageFrom: vi.fn(),
    admin: vi.fn(),
}));

vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));

const originalEnvironment = process.env;
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
    process.env = { ...originalEnvironment };
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
    process.env = originalEnvironment;
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


const candidateId = "550e8400-e29b-41d4-a716-446655440000";
const candidateRow = {
    id: candidateId, ownerId: "auth:owner", ownerSource: "new", legacyUserId: null,
    title: "Seoul Weekend", city: "Seoul", days: 1, activities: "[]", highlights: "[]",
    created_at: "2026-10-03T00:00:00Z", shared: 0, is_favorite: 0, is_public: 0,
    ai_backgrounds: "{}", story_slides: null,
};
function candidateRequest(query = "slide=cover&debug=true", host = "localley-next-preview.nkopp.workers.dev", flag = true) {
    return GET(new NextRequest(`https://${host}/api/itineraries/${candidateId}/story?${query}${flag ? "&data_candidate=d1" : ""}`), {
        params: Promise.resolve({ id: candidateId }),
    });
}

describe("candidate story renderer with real ImageResponse", () => {
    beforeEach(() => {
        process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
        mocks.auth.mockResolvedValue({ userId: "owner" });
        mocks.first.mockResolvedValue({ ...candidateRow });
        mocks.reader.mockReturnValue({ prepare: () => ({ bind: () => ({ first: mocks.first }) }) });
    });

    it.each(["cover", "day", "summary"])("renders owned %s from D1 without the source client", async slide => {
        const debug = await candidateRequest(`slide=${slide}&debug=true`);
        expect(await debug.json()).toMatchObject({ step: "render_success", dataSource: "d1-preview" });
        const response = await candidateRequest(`slide=${slide}`);
        expect(response.status).toBe(200);
        expect(response.headers.get("x-localley-data-source")).toBe("d1-preview");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 1080, height: 1920, format: "png" });
        expect(mocks.admin).not.toHaveBeenCalled();
    }, 30000);

    it("hides private and missing records before any image or diagnostic render", async () => {
        mocks.auth.mockResolvedValue({ userId: "other" });
        const render = vi.spyOn(ImageResponse.prototype, "arrayBuffer");
        for (const value of [candidateRow, null]) {
            mocks.first.mockResolvedValue(value);
            const response = await candidateRequest();
            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ error: "Itinerary not found" });
        }
        expect(render).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
        expect(mocks.admin).not.toHaveBeenCalled();
    });

    it("allows anonymous explicitly public records while expired persisted slides confer no access", async () => {
        mocks.auth.mockResolvedValue({ userId: null });
        const expired = JSON.stringify({ slides: { cover: "https://fixture.supabase.co/expired.png" },
            generated_at: "2020-01-01T00:00:00Z", expires_at: "2020-01-02T00:00:00Z", tier: "free" });
        mocks.first.mockResolvedValue({ ...candidateRow, story_slides: expired });
        expect((await candidateRequest()).status).toBe(404);
        mocks.first.mockResolvedValue({ ...candidateRow, is_public: 1, story_slides: expired });
        const response = await candidateRequest();
        expect(await response.json()).toMatchObject({ step: "render_success", background: { prefetchSuccess: false } });
        expect(response.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
        expect(mocks.admin).not.toHaveBeenCalled();
        // Stored PNG expiry belongs to persist/media; a fresh render remains available, as on www.
    }, 30000);

    it.each(["png", "webp"])("prefetches %s by bytes despite incorrect headers and never uses source storage", async format => {
        const bytes = format === "png"
            ? await sharp({ create: { width: 64, height: 64, channels: 3, background: "red" } }).png({ compressionLevel: 0 }).toBuffer()
            : Buffer.concat([Buffer.from("RIFFxxxxWEBP"), Buffer.alloc(600)]);
        const previousFetch = fetch;
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).includes("fixture.supabase.co")
            ? new Response(bytes, { headers: { "Content-Type": format === "png" ? "image/webp" : "image/png" } })
            : previousFetch(input)));
        mocks.first.mockResolvedValue({ ...candidateRow, ai_backgrounds: JSON.stringify({
            cover: "https://fixture.supabase.co/storage/v1/object/public/generated-images/background.png" }) });
        const response = await candidateRequest();
        expect(await response.json()).toMatchObject({ step: "render_success", background: { prefetchSuccess: format === "png" } });
        expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.storageFrom).not.toHaveBeenCalled();
    }, 30000);

    it("fails closed on D1 errors and hostile background URLs without source fallback", async () => {
        for (const row of [{ ...candidateRow, ai_backgrounds: '{"cover":"http://127.0.0.1/private"}' },
            { ...candidateRow, ai_backgrounds: '{"cover":42}' }]) {
            mocks.first.mockResolvedValue(row);
            const response = await candidateRequest();
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ error: "Failed to load story" });
        }
        mocks.first.mockRejectedValue(new Error("secret database details"));
        const response = await candidateRequest();
        expect(response.status).toBe(500); expect(await response.text()).not.toContain("secret");
        expect(fetch).not.toHaveBeenCalled(); expect(mocks.admin).not.toHaveBeenCalled();
    });

    it("keeps unflagged preview and www on the existing repository", async () => {
        for (const [host, flag] of [["localley-next-preview.nkopp.workers.dev", false], ["www.localley.io", true]] as const) {
            const response = await candidateRequest("slide=cover&debug=true", host, flag);
            expect(await response.json()).toMatchObject({ step: "render_success", supabaseCreated: true });
            expect(response.headers.get("x-localley-data-source")).toBeNull();
        }
        expect(mocks.admin).toHaveBeenCalledTimes(2); expect(mocks.reader).not.toHaveBeenCalled();
    }, 30000);
});
