import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), write: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/app-data/preview-story-metadata", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-story-metadata")>(),
  previewStoryBackgrounds: mocks.read, updatePreviewStoryBackgrounds: mocks.write,
}));

import { GET, PATCH } from "@/app/api/itineraries/[id]/ai-backgrounds/route";

const environment = process.env;
const id = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id }) };
const preview = "localley-next-preview.nkopp.workers.dev";
const request = (host: string, method = "GET", candidate = true, body?: object, fresh = false) => new NextRequest(
  `https://${host}/api/itineraries/${id}/ai-backgrounds${candidate ? "?data_candidate=d1" : ""}${fresh ? "&background_candidate=fresh" : ""}`,
  { method, ...(body ? { body: JSON.stringify(body) } : {}) },
);

afterEach(() => { vi.clearAllMocks(); process.env = environment; });

describe("existing story backgrounds route candidate", () => {
  it("uses only D1 for an opted-in, signed-in preview owner", async () => {
    process.env = { ...environment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.read.mockResolvedValue({ cover: "/images/old.png" });
    mocks.write.mockResolvedValue({ cover: "/images/new.png", day1: "/images/keep.png" });
    const get = await GET(request(preview), params);
    expect(get.status).toBe(200);
    expect(get.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await get.json()).toEqual({ success: true, backgrounds: { cover: "/images/old.png" } });
    const patch = await PATCH(request(preview, "PATCH", true, { cover: "/images/new.png" }), params);
    expect(patch.status).toBe(200);
    expect(await patch.json()).toEqual({ success: true, itinerary: {
      id, ai_backgrounds: { cover: "/images/new.png", day1: "/images/keep.png" },
    } });
    expect(mocks.write).toHaveBeenCalledWith(id, "owner-id", { cover: "/images/new.png" });
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("hides missing or differently owned records and rejects unsafe writes", async () => {
    process.env = { ...environment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "other-owner" });
    expect((await GET(request(preview), params)).status).toBe(401);
    mocks.read.mockResolvedValue(null);
    expect((await GET(request(preview), params)).status).toBe(404);
    mocks.write.mockResolvedValue(null);
    expect((await PATCH(request(preview, "PATCH", true, { cover: "/images/new.png" }), params)).status).toBe(404);
    expect((await PATCH(request(preview, "PATCH", true, { cover: "https://example.com/spy.png" }), params)).status).toBe(400);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps Supabase on www and normal preview requests", async () => {
    process.env = { ...environment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id, clerk_user_id: "owner-id", ai_backgrounds: { cover: "/images/live.png" } }, error: null }),
    };
    mocks.supabase.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const liveGet = await GET(request("www.localley.io", "GET", true, undefined, true), params);
    expect(liveGet.status).toBe(200);
    expect(await liveGet.json()).toEqual({ success: true, backgrounds: { cover: "/images/live.png" } });
    const livePatch = await PATCH(request("www.localley.io", "PATCH", true, { cover: "/images/live.png" }, true), params);
    expect(livePatch.status).toBe(200);
    const previewGet = await GET(request(preview, "GET", false), params);
    expect(previewGet.status).toBe(200);
    expect(mocks.supabase).toHaveBeenCalledTimes(3);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
