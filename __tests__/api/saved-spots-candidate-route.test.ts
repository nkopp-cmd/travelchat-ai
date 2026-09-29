import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), supabase: vi.fn(), create: vi.fn(),
  remove: vi.fn(), one: vi.fn(), all: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.supabase }));
vi.mock("@/lib/app-data/preview-saved-spots", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-saved-spots")>(),
  createPreviewSavedSpot: mocks.create, deletePreviewSavedSpot: mocks.remove,
  previewSavedSpot: mocks.one, previewSavedSpots: mocks.all,
}));
import { DELETE, GET, POST } from "@/app/api/spots/save/route";

const environment = process.env;
const spotId = "11111111-1111-4111-8111-111111111111";
const preview = "localley-next-preview.nkopp.workers.dev";
const request = (host: string, method: "GET" | "POST" | "DELETE", candidate = true) =>
  new NextRequest(`https://${host}/api/spots/save${candidate ? "?data_candidate=d1&" : "?"}spotId=${spotId}`,
    method === "GET" ? { method } : { method, body: JSON.stringify({ spotId }) });
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("saved spot candidate route", () => {
  it("requires auth and validates the spot ID before D1", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "user-a" });
    expect((await GET(request(preview, "GET"))).status).toBe(401);
    const invalid = new NextRequest(`https://${preview}/api/spots/save?data_candidate=d1&spotId=bad`);
    expect((await GET(invalid)).status).toBe(400);
    expect(mocks.one).not.toHaveBeenCalled();
  });

  it("reads, saves idempotently and deletes only on the exact preview candidate", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    mocks.one.mockResolvedValue(true);
    mocks.all.mockResolvedValue({ success: true, spots: [] });
    mocks.create.mockResolvedValueOnce({ kind: "saved" }).mockResolvedValue({ kind: "already" });
    const check = await GET(request(preview, "GET"));
    const list = await GET(new NextRequest(`https://${preview}/api/spots/save?data_candidate=d1`));
    const saved = await POST(request(preview, "POST"));
    const repeat = await POST(request(preview, "POST"));
    const removed = await DELETE(request(preview, "DELETE"));
    expect([check.status, list.status, saved.status, repeat.status, removed.status]).toEqual([200, 200, 200, 200, 200]);
    expect(await check.json()).toEqual({ saved: true });
    expect(await list.json()).toEqual({ success: true, spots: [] });
    expect((await repeat.json()).message).toBe("Spot already saved");
    expect((await removed.json()).saved).toBe(false);
    expect(saved.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.create).toHaveBeenCalledWith("user-a", spotId);
    expect(mocks.remove).toHaveBeenCalledWith("user-a", spotId);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("returns missing and limit errors from D1", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    mocks.create.mockResolvedValueOnce({ kind: "missing" })
      .mockResolvedValueOnce({ kind: "limit", current: 10, limit: 10 });
    expect((await POST(request(preview, "POST"))).status).toBe(404);
    expect((await POST(request(preview, "POST"))).status).toBe(429);
  });

  it("keeps normal preview and www reads on Supabase", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    mocks.supabase.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
    expect((await GET(request(preview, "GET", false))).status).toBe(200);
    expect((await GET(request("www.localley.io", "GET"))).status).toBe(200);
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.one).not.toHaveBeenCalled();
  });
});
