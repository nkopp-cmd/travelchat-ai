import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), server: vi.fn(), engagement: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-itinerary-detail", async original => ({
  ...await original<typeof import("@/lib/app-data/preview-itinerary-detail")>(),
  previewItineraryDetail: mocks.read,
}));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.server }));
vi.mock("@/lib/engagement-tracking", () => ({ trackEngagement: mocks.engagement }));
import { GET } from "@/app/api/itineraries/[id]/route";

const id = "550e8400-e29b-41d4-a716-446655440000";
const environment = process.env;
const request = (host: string, flag = "?data_candidate=d1") => GET(new NextRequest(
  `https://${host}/api/itineraries/${id}${flag}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.auth.mockResolvedValue({ userId: "user_one" });
  mocks.read.mockResolvedValue({ state: "found", itinerary: { id, title: "Seoul" } });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id, clerk_user_id: "user_one", is_public: false }, error: null }) };
  mocks.server.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
});
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("itinerary detail candidate route", () => {
  it("returns D1 history without Supabase or engagement writes", async () => {
    const response = await request("localley-next-preview.nkopp.workers.dev");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ id, title: "Seoul" });
    expect(mocks.server).not.toHaveBeenCalled();
    expect(mocks.engagement).not.toHaveBeenCalled();
  });

  it("preserves not-found, forbidden and failed-D1 responses", async () => {
    mocks.read.mockResolvedValueOnce({ state: "missing" }).mockResolvedValueOnce({ state: "forbidden" })
      .mockRejectedValueOnce(new Error("private data"));
    const host = "localley-next-preview.nkopp.workers.dev";
    expect((await request(host)).status).toBe(404);
    expect((await request(host)).status).toBe(403);
    const failed = await request(host);
    expect(failed.status).toBe(500);
    expect(failed.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await failed.text()).not.toContain("private data");
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on the existing route", async () => {
    const preview = await request("localley-next-preview.nkopp.workers.dev", "");
    const www = await request("www.localley.io");
    expect([preview.status, www.status]).toEqual([200, 200]);
    expect(preview.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(www.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.server).toHaveBeenCalledTimes(2);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("denies signed-out callers before either repository", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.server).not.toHaveBeenCalled();
  });
});
