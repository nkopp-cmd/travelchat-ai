import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), archive: vi.fn(), reject: vi.fn(), supabase: vi.fn(), stripe: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/app-data/preview-admin-guides", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-admin-guides")>(),
  previewAdminGuides: mocks.archive,
}));
vi.mock("@/lib/app-data/preview-guide-application", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-guide-application")>(),
  rejectPreviewGuideApplication: mocks.reject,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/stripe-connect", () => ({ createConnectAccount: mocks.stripe, createOnboardingLink: mocks.stripe }));
import { PATCH } from "@/app/api/admin/guides/route";
import { PreviewGuideApplicationNotFound } from "@/lib/app-data/preview-guide-application";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });
const request = (host: string, body: unknown = { clerkUserId: "owner-1", action: "reject" }, flag = true) =>
  new NextRequest(`https://${host}/api/admin/guides${flag ? "?data_candidate=d1" : ""}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const allow = (id = "user_38VRkLQbwVNbAqR9lBXTMGXr54h") => {
  process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.admin.mockResolvedValue({ response: null, userId: id });
  mocks.archive.mockResolvedValue([]);
  mocks.reject.mockResolvedValue({ status: "rejected" });
};

describe("admin guide rejection candidate", () => {
  it.each(["user_38VRkLQbwVNbAqR9lBXTMGXr54h", "eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx"])(
    "rejects a preview application for retained admin %s", async id => {
      allow(id);
      const response = await PATCH(request("localley-next-preview.nkopp.workers.dev"));
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ status: "rejected" });
      expect(mocks.reject).toHaveBeenCalledWith("owner-1", id);
      expect(mocks.supabase).not.toHaveBeenCalled();
      expect(mocks.stripe).not.toHaveBeenCalled();
    });

  it.each([401, 403])("denies unauthorized status %i before D1", async status => {
    allow();
    mocks.admin.mockResolvedValue({ response: NextResponse.json({ error: "denied" }, { status }), userId: null });
    expect((await PATCH(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(status);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
  });

  it("refuses invalid input and unavailable approve or suspend actions", async () => {
    allow();
    expect((await PATCH(request("localley-next-preview.nkopp.workers.dev", { clerkUserId: "", action: "reject" }))).status).toBe(400);
    for (const action of ["approve", "suspend"]) {
      expect((await PATCH(request("localley-next-preview.nkopp.workers.dev", { clerkUserId: "owner-1", action }))).status).toBe(503);
    }
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("refuses an archived owner and a missing archive without writing", async () => {
    allow();
    mocks.archive.mockResolvedValueOnce([{ clerk_user_id: "owner-1" }]);
    expect((await PATCH(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(503);
    mocks.archive.mockRejectedValueOnce(new Error("count mismatch"));
    expect((await PATCH(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(503);
    expect(mocks.reject).not.toHaveBeenCalled();
  });

  it("returns missing and D1 failures without Supabase fallback", async () => {
    allow();
    mocks.reject.mockRejectedValueOnce(new PreviewGuideApplicationNotFound("missing"));
    expect((await PATCH(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(404);
    mocks.reject.mockRejectedValueOnce(new Error("D1 unavailable"));
    expect((await PATCH(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(503);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on the existing Supabase route", async () => {
    allow();
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.supabase.mockReturnValue({ from: () => ({ update }) });
    expect((await PATCH(request("localley-next-preview.nkopp.workers.dev", undefined, false))).status).toBe(200);
    expect((await PATCH(request("www.localley.io"))).status).toBe(200);
    expect(update).toHaveBeenCalledTimes(2);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
  });
});
