import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), approve: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/app-data/preview-payout-approval", async original => ({
  ...await original<typeof import("@/lib/app-data/preview-payout-approval")>(),
  approvePreviewPayouts: mocks.approve,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
import { POST } from "@/app/api/admin/payouts/approve/route";
import { PreviewPayoutMissing } from "@/lib/app-data/preview-payout-approval";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });
const request = (host: string, body: unknown = { month: "2026-09-01" }, flag = true) =>
  new NextRequest(`https://${host}/api/admin/payouts/approve${flag ? "?data_candidate=d1" : ""}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const allow = (id = "user_38VRkLQbwVNbAqR9lBXTMGXr54h") => {
  process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.admin.mockResolvedValue({ response: null, userId: id });
  mocks.approve.mockResolvedValue(1);
};

describe("admin payout approval candidate route", () => {
  it.each(["user_38VRkLQbwVNbAqR9lBXTMGXr54h", "eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx"])(
    "uses preview D1 for retained admin %s", async id => {
      allow(id);
      const response = await POST(request("localley-next-preview.nkopp.workers.dev"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ approved: 1 });
      expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
      expect(mocks.approve).toHaveBeenCalledWith({ month: "2026-09-01" }, id);
      expect(mocks.supabase).not.toHaveBeenCalled();
    });

  it.each([401, 403])("denies status %i before parsing or D1", async status => {
    allow();
    mocks.admin.mockResolvedValue({ response: NextResponse.json({ error: "denied" }, { status }), userId: null });
    expect((await POST(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(status);
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("refuses bad input, missing earnings and D1 failure without fallback", async () => {
    allow();
    expect((await POST(request("localley-next-preview.nkopp.workers.dev", {}))).status).toBe(400);
    mocks.approve.mockRejectedValueOnce(new PreviewPayoutMissing("missing"));
    expect((await POST(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(404);
    mocks.approve.mockRejectedValueOnce(new Error("D1 unavailable"));
    expect((await POST(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(503);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on the existing Supabase route", async () => {
    allow();
    const select = vi.fn().mockResolvedValue({ error: null, count: 1 });
    const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select }) });
    mocks.supabase.mockReturnValue({ from: () => ({ update: () => ({ eq }) }) });
    const normal = await POST(request("localley-next-preview.nkopp.workers.dev", undefined, false));
    const www = await POST(request("www.localley.io"));
    expect(normal.status).toBe(200);
    expect(www.status).toBe(200);
    expect(normal.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
});
