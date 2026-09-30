import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), remove: vi.fn(), server: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-itinerary-delete", () => ({ deletePreviewItinerary: mocks.remove }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.server }));
import { DELETE } from "@/app/api/itineraries/[id]/route";

const id = "550e8400-e29b-41d4-a716-446655440000";
const environment = process.env;
const request = (host: string, flag = "?data_candidate=d1") => DELETE(new NextRequest(
  `https://${host}/api/itineraries/${id}${flag}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.auth.mockResolvedValue({ userId: "user_one" });
  mocks.remove.mockResolvedValue("deleted");
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { clerk_user_id: "user_one" }, error: null }),
    delete: vi.fn().mockReturnThis() };
  mocks.server.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
});
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("itinerary delete candidate route", () => {
  it("deletes only through the exact preview D1 gate", async () => {
    const response = await request("localley-next-preview.nkopp.workers.dev");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.remove).toHaveBeenCalledWith(id, "user_one");
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it("returns bounded missing, forbidden and database responses", async () => {
    mocks.remove.mockResolvedValueOnce("missing").mockResolvedValueOnce("forbidden")
      .mockRejectedValueOnce(new Error("private SQL"));
    const host = "localley-next-preview.nkopp.workers.dev";
    expect((await request(host)).status).toBe(404);
    expect((await request(host)).status).toBe(403);
    const failed = await request(host);
    expect(failed.status).toBe(500);
    expect(failed.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await failed.text()).not.toContain("private SQL");
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    const preview = await request("localley-next-preview.nkopp.workers.dev", "");
    const www = await request("www.localley.io");
    expect([preview.status, www.status]).toEqual([200, 200]);
    expect(preview.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(www.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.server).toHaveBeenCalledTimes(2);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects signed-out requests before either database", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(401);
    expect(mocks.server).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
