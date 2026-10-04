import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), guides: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/app-data/preview-admin-guides", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-admin-guides")>(),
  previewAdminGuideList: mocks.guides,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/stripe-connect", () => ({ createConnectAccount: vi.fn(), createOnboardingLink: vi.fn() }));
import { GET } from "@/app/api/admin/guides/route";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });
const request = (host: string, candidate = true, status = "pending") => new NextRequest(
  `https://${host}/api/admin/guides?status=${status}${candidate ? "&data_candidate=d1" : ""}`);
const allow = (id: string) => {
  process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.admin.mockResolvedValue({ response: null, userId: id });
};

describe("admin guide candidate route", () => {
  it.each(["user_38VRkLQbwVNbAqR9lBXTMGXr54h", "eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx"])(
    "serves preview D1 after admin authorization for %s", async id => {
      allow(id);
      mocks.guides.mockResolvedValue([{ id: "guide-1" }]);
      const response = await GET(request("localley-next-preview.nkopp.workers.dev"));
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect((await response.json()).guides).toEqual([{ id: "guide-1" }]);
      expect(mocks.guides).toHaveBeenCalledWith("pending");
      expect(mocks.supabase).not.toHaveBeenCalled();
    });

  it.each([401, 403])("refuses unauthorized requests with %i before any data access", async status => {
    mocks.admin.mockResolvedValue({ response: NextResponse.json({ error: "refused" }, { status }), userId: null });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(status);
    expect(mocks.guides).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("fails closed when the candidate archive is missing", async () => {
    allow("user_38VRkLQbwVNbAqR9lBXTMGXr54h");
    mocks.guides.mockRejectedValue(new Error("missing archive"));
    const response = await GET(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it.each([
    { AUTH_MAIL_MODE: undefined, SUPABASE_READ_ONLY: undefined },
    { AUTH_MAIL_MODE: undefined, SUPABASE_READ_ONLY: "true" },
    { AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: undefined },
    { AUTH_MAIL_MODE: "send", SUPABASE_READ_ONLY: "true" },
    { AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "false" },
  ])("refuses unsafe settings before either reader", async vars => {
    allow("user_38VRkLQbwVNbAqR9lBXTMGXr54h");
    process.env = { ...process.env, ...vars };
    const response = await GET(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Guide archive unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.guides).not.toHaveBeenCalled(); expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    allow("user_38VRkLQbwVNbAqR9lBXTMGXr54h");
    const query = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.supabase.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev", false))).status).toBe(200);
    expect((await GET(request("www.localley.io"))).status).toBe(200);
    expect(mocks.guides).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("status", "pending");
  });
});
