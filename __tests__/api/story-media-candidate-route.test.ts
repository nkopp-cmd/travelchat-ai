// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), story: vi.fn(), bucket: vi.fn(), owner: vi.fn(), save: vi.fn(), tier: vi.fn(), candidateTier: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier }));
vi.mock("@/lib/app-data/preview-story-tier", () => ({ previewStoryTier: mocks.candidateTier }));
vi.mock("@/lib/subscription", () => ({ hasFeature: () => 7 }));
vi.mock("@/lib/app-data/preview-story-slides", () => ({ previewStorySlides: mocks.story }));
vi.mock("@/lib/app-data/preview-story-media", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-story-media")>(),
  previewStoryBucket: mocks.bucket, previewStoryOwner: mocks.owner, savePreviewStoryMedia: mocks.save,
}));

import { POST } from "@/app/api/itineraries/[id]/story/persist/route";
import { GET } from "@/app/api/itineraries/[id]/story/media/[generation]/[slide]/route";
import { isPublicRoute } from "@/middleware";

const originalEnvironment = process.env;
const id = "11111111-1111-4111-8111-111111111111";
const generation = "22222222-2222-4222-8222-222222222222";
const preview = "localley-next-preview.nkopp.workers.dev";
const mediaPath = `/api/itineraries/${id}/story/media/${generation}/cover`;
const mediaUrl = `https://${preview}${mediaPath}?data_candidate=d1`;
const mediaParams = { params: Promise.resolve({ id, generation, slide: "cover" }) };
const persistParams = { params: Promise.resolve({ id }) };

afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

describe("preview story media routes", () => {
  it("writes only the exact preview owner's story and keeps Supabase out of the candidate", async () => {
    process.env = { ...originalEnvironment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.currentUser.mockResolvedValue({ id: "owner-id", primaryEmailAddress: { emailAddress: "owner@example.test" } });
    mocks.owner.mockResolvedValue(true);
    mocks.candidateTier.mockResolvedValue("free");
    mocks.save.mockResolvedValue({ slides: { cover: mediaUrl }, expiresAt: "2026-10-06T00:00:00Z", retentionDays: 7, tier: "free" });
    const form = new FormData(); form.append("cover", new Blob(["png"]));
    const request = new NextRequest(`https://${preview}/api/itineraries/${id}/story/persist?data_candidate=d1`, { method: "POST", body: form });
    const response = await POST(request, persistParams);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect((await response.json()).slides.cover).toBe(mediaUrl);
    expect(mocks.owner).toHaveBeenCalledWith(id, "owner-id");
    expect(mocks.candidateTier).toHaveBeenCalledWith("owner-id", "owner@example.test");
    expect(mocks.save).toHaveBeenCalledWith(id, "owner-id", expect.any(FormData), "free", 7);
    expect(mocks.tier).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
    mocks.owner.mockResolvedValue(false);
    expect((await POST(new NextRequest(request.url, { method: "POST", body: form }), persistParams)).status).toBe(404);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.candidateTier).toHaveBeenCalledTimes(1);
  });

  it("serves only the current unexpired owner's or public slide", async () => {
    process.env = { ...originalEnvironment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.story.mockResolvedValue({ available: true, slides: { cover: mediaUrl } });
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const get = vi.fn().mockResolvedValue({ arrayBuffer: async () => bytes.buffer });
    mocks.bucket.mockReturnValue({ get });
    const response = await GET(new NextRequest(mediaUrl), mediaParams);
    expect(isPublicRoute(new NextRequest(mediaUrl))).toBe(true);
    expect(isPublicRoute(new NextRequest(mediaUrl.replace(preview, "www.localley.io")))).toBe(false);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(get).toHaveBeenCalledWith(`story-slides/${id}/${generation}/cover.png`);
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(new NextRequest(mediaUrl), mediaParams)).status).toBe(200);
    mocks.story.mockResolvedValue(null);
    expect((await GET(new NextRequest(mediaUrl), mediaParams)).status).toBe(404);
    expect((await GET(new NextRequest(mediaUrl.replace(preview, "www.localley.io")), mediaParams)).status).toBe(404);
  });

  it("rejects a changed session identity before tier lookup or upload", async () => {
    process.env = { ...originalEnvironment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.currentUser.mockResolvedValue({ id: "other-id", primaryEmailAddress: null });
    mocks.owner.mockResolvedValue(true);
    const form = new FormData(); form.append("cover", new Blob(["png"]));
    const response = await POST(new NextRequest(`https://${preview}/api/itineraries/${id}/story/persist?data_candidate=d1`,
      { method: "POST", body: form }), persistParams);
    expect(response.status).toBe(401);
    expect(mocks.candidateTier).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps the existing Supabase POST on www and normal preview", async () => {
    process.env = { ...originalEnvironment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.tier.mockResolvedValue("free");
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { clerk_user_id: "owner-id" }, error: null }),
      update: vi.fn().mockReturnThis() };
    const storage = { upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/cover.png" } }) };
    mocks.supabase.mockReturnValue({ from: vi.fn().mockReturnValue(query), storage: { from: vi.fn().mockReturnValue(storage) } });
    for (const host of ["www.localley.io", preview]) {
      const form = new FormData(); form.append("cover", new Blob(["png"]));
      const suffix = host === preview ? "" : "?data_candidate=d1";
      const request = new NextRequest(`https://${host}/api/itineraries/${id}/story/persist${suffix}`, { method: "POST", body: form });
      expect((await POST(request, persistParams)).status).toBe(200);
    }
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.tier).toHaveBeenCalledTimes(2);
    expect(mocks.candidateTier).not.toHaveBeenCalled();
    expect(mocks.owner).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
