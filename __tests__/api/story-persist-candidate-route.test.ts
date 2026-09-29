import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/app-data/preview-story-slides", () => ({ previewStorySlides: mocks.read }));

import { GET } from "@/app/api/itineraries/[id]/story/persist/route";

const environment = process.env;
const params = { params: Promise.resolve({ id: "trip-id" }) };
const request = (host: string, candidate = true) => new NextRequest(
  `https://${host}/api/itineraries/trip-id/story/persist${candidate ? "?data_candidate=d1" : ""}`,
);

afterEach(() => { vi.clearAllMocks(); process.env = environment; });

describe("story persist GET candidate", () => {
  it("reads D1 only for the explicit preview request and enforces owner lookup", async () => {
    process.env = { ...environment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.read.mockResolvedValueOnce({ success: true, available: false }).mockResolvedValueOnce(null);
    const owner = await GET(request("localley-next-preview.nkopp.workers.dev"), params);
    expect(owner.status).toBe(200);
    expect(owner.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await owner.json()).toEqual({ success: true, available: false });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev"), params)).status).toBe(404);
    expect(mocks.read).toHaveBeenCalledWith("trip-id", "owner-id");
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps www and normal preview on Supabase", async () => {
    process.env = { ...environment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { story_slides: null, shared: false }, error: null }) };
    mocks.supabase.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    expect((await GET(request("www.localley.io"), params)).status).toBe(200);
    expect((await GET(request("localley-next-preview.nkopp.workers.dev", false), params)).status).toBe(200);
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
