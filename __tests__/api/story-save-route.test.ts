// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import React from "react";
import { POST } from "@/app/api/itineraries/[id]/story/save/route";

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), admin: vi.fn(), single: vi.fn(), select: vi.fn(),
    update: vi.fn(), eq: vi.fn(), upload: vi.fn(), render: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/app/api/itineraries/[id]/story/route", () => ({ GET: mocks.render }));

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
function save(body = '{"totalDays":1}') {
    return POST(new NextRequest("https://protected.example/api/itineraries/trip/story/save?debug=true&paid=true", {
        method: "POST", body, headers: { authorization: "Bearer do-not-forward" },
    }), { params: Promise.resolve({ id: "trip" }) });
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed"); }));
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.single.mockResolvedValue({ data: { clerk_user_id: "owner", is_public: false }, error: null });
    mocks.select.mockReturnValue({ eq: vi.fn(() => ({ single: mocks.single })) });
    mocks.eq.mockReturnValue({ eq: mocks.eq, error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({
        from: vi.fn(() => ({ select: mocks.select, update: mocks.update })),
        storage: { from: vi.fn(() => ({ upload: mocks.upload,
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/${path}` } }),
        })) },
    });
    mocks.render.mockImplementation(async () => new Response(png, { headers: { "content-type": "image/png" } }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("story save", () => {
    it.each(["anonymous", "other", "missing", "database"])("guards %s before parsing or rendering", async (kind) => {
        if (kind === "anonymous") mocks.auth.mockResolvedValue({ userId: null });
        if (kind === "other") mocks.single.mockResolvedValue({ data: { clerk_user_id: "other" }, error: null });
        if (kind === "missing") mocks.single.mockResolvedValue({ data: null, error: null });
        if (kind === "database") mocks.single.mockResolvedValue({ data: null, error: { message: "failed" } });
        const response = await save("{");
        expect(response.status).toBe(kind === "anonymous" ? 401 : kind === "other" ? 403 : 404);
        expect(mocks.render).not.toHaveBeenCalled();
        expect(mocks.upload).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it.each(["{", "null", "[]", "1", '"text"', "{}", '{"totalDays":"1"}', '{"totalDays":0}', '{"totalDays":-1}', '{"totalDays":1.5}', '{"totalDays":31}', '{"totalDays":1e100}', '{"totalDays":1e999}'])("rejects invalid body %s", async (body) => {
        expect((await save(body)).status).toBe(400);
        expect(mocks.render).not.toHaveBeenCalled();
        expect(mocks.upload).not.toHaveBeenCalled();
    });

    it.each([false, true])("calls GET directly with exact queries, paid=%s", async (paid) => {
        const response = await save(JSON.stringify({ totalDays: 2, paid }));
        const result = await response.json();
        expect(result).toEqual({ success: true, slides: Object.fromEntries(["cover", "day1", "day2", "summary"].map(key => [key, `https://storage.example/story-slides/trip/${key}.png`])) });
        expect(mocks.select).toHaveBeenCalledWith("*");
        for (const [index, [request, context]] of mocks.render.mock.calls.entries()) {
            expect(request).toBeInstanceOf(NextRequest);
            const suffix = paid ? "&paid=true" : "";
            expect(request.url).toBe(`https://protected.example/api/itineraries/trip/story?${["slide=cover", "slide=day&day=1", "slide=day&day=2", "slide=summary"][index]}${suffix}`);
            expect(request.headers.has("authorization")).toBe(false);
            expect(await context.params).toEqual({ id: "trip" });
        }
        expect(fetch).not.toHaveBeenCalled();
        expect(mocks.upload).toHaveBeenCalledWith("story-slides/trip/cover.png", png, { contentType: "image/png", upsert: true });
        expect(mocks.update).toHaveBeenCalledWith({ story_slides: result.slides });
        expect(mocks.eq.mock.calls).toEqual([["id", "trip"], ["clerk_user_id", "owner"]]);
    });

    it("bounds the largest accepted request to 32 slides", async () => {
        expect((await save('{"totalDays":30}')).status).toBe(200);
        expect(mocks.render).toHaveBeenCalledTimes(32);
    });

    it.each(["auth", "json", "jpeg", "webp", "short", "signature", "stream", "upload"])("keeps partial results when %s fails", async (failure) => {
        if (failure === "upload") mocks.upload.mockResolvedValueOnce({ error: { message: "failed" } });
        else mocks.render.mockImplementationOnce(async () => {
            if (failure === "auth") return new Response('{"error":"private"}', { status: 404 });
            if (failure === "json") return new Response('{}', { headers: { "content-type": "application/json" } });
            if (failure === "stream") return new Response(new ReadableStream({ start(controller) { controller.error(new Error("broken")); } }), { headers: { "content-type": "image/png" } });
            const bytes = failure === "short" ? png.subarray(0, 4) : failure === "signature" ? Buffer.from([137, 80, 78, 71, 0, 0, 0, 0]) : Buffer.from(failure === "jpeg" ? [255, 216, 255, 0, 0, 0, 0, 0] : "RIFF0000WEBP");
            return new Response(bytes, { headers: { "content-type": "image/png" } });
        });
        const result = await (await save()).json();
        expect(result).toEqual({ success: true, failed: ["cover"], slides: {
            day1: "https://storage.example/story-slides/trip/day1.png",
            summary: "https://storage.example/story-slides/trip/summary.png",
        } });
        expect(mocks.upload).toHaveBeenCalledTimes(failure === "upload" ? 3 : 2);
        expect(mocks.update).toHaveBeenCalledWith({ story_slides: result.slides });
    });

    it("preserves the all-failed contract without updating stored URLs", async () => {
        mocks.render.mockResolvedValue(new Response('{}', { status: 401 }));
        expect(await (await save()).json()).toEqual({ success: true, slides: {}, failed: ["cover", "day1", "summary"] });
        expect(mocks.upload).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("returns the existing database error shape", async () => {
        mocks.eq.mockReturnValue({ eq: mocks.eq, error: { message: "failed" } });
        const response = await save();
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ error: { code: "database_error" } });
    });

    it("saves private cover, day and summary through the real authorized GET offline", async () => {
        const { GET } = await vi.importActual<typeof import("@/app/api/itineraries/[id]/story/route")>("@/app/api/itineraries/[id]/story/route");
        vi.stubGlobal("React", React);
        mocks.single.mockResolvedValue({ data: {
            id: "trip", clerk_user_id: "owner", is_public: false,
            title: "Seoul Weekend", city: "Seoul", days: 1,
            activities: [], highlights: [], ai_backgrounds: null,
        }, error: null });
        vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith("https://cdn.jsdelivr.net/") && url.endsWith(".svg")) {
                return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="14" fill="gold"/></svg>', {
                    headers: { "Content-Type": "image/svg+xml" },
                });
            }
            throw new Error(`Unexpected network access: ${url}`);
        }));
        mocks.render.mockImplementation(GET);
        const result = await (await save()).json();
        expect(result.success).toBe(true);
        expect(result.failed).toBeUndefined();
        expect(Object.keys(result.slides)).toEqual(["cover", "day1", "summary"]);
        // The outer guard and all three real GET calls use the same verified Clerk identity.
        expect(mocks.auth).toHaveBeenCalledTimes(4);
        expect(mocks.single).toHaveBeenCalledTimes(4);
        expect(mocks.upload).toHaveBeenCalledTimes(3);
        for (const [, bytes] of mocks.upload.mock.calls) {
            expect(bytes.subarray(0, 8)).toEqual(png.subarray(0, 8));
            expect(bytes.length).toBeGreaterThan(1000);
        }
        expect(mocks.eq.mock.calls).toEqual([["id", "trip"], ["clerk_user_id", "owner"]]);
        for (const [input] of vi.mocked(fetch).mock.calls) {
            expect(String(input)).not.toContain("/api/itineraries/");
        }
    }, 30000);
});
