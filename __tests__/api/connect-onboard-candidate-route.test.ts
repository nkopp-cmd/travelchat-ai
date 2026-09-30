import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), user: vi.fn(), guides: vi.fn(), read: vi.fn(), create: vi.fn(),
  supabase: vi.fn(), configured: vi.fn(), account: vi.fn(), link: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-admin-guides", () => ({ previewAdminGuides: mocks.guides }));
vi.mock("@/lib/app-data/preview-guide-application", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-guide-application")>(),
  readPreviewGuideApplication: mocks.read, createPreviewGuideApplication: mocks.create,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/stripe-connect", () => ({
  isConnectConfigured: mocks.configured, createConnectAccount: mocks.account, createOnboardingLink: mocks.link,
}));
import { POST } from "@/app/api/connect/onboard/route";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });
const request = (host: string, body: unknown = { bio: "Local guide", specialties: ["food"], cities: ["seoul"] }, flag = true) =>
  new NextRequest(`https://${host}/api/connect/onboard${flag ? "?data_candidate=d1" : ""}`,
    { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const preview = () => {
  process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.auth.mockResolvedValue({ userId: "owner-1" });
  mocks.user.mockResolvedValue({ id: "owner-1", emailAddresses: [] });
  mocks.guides.mockResolvedValue([]);
  mocks.read.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "application-1" });
};

describe("Connect guide application candidate", () => {
  it("authorizes before D1 and writes only the preview candidate", async () => {
    preview();
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await POST(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(401);
    expect(mocks.guides).not.toHaveBeenCalled();
    const response = await POST(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await response.json()).toEqual({ status: "pending", message: "Application submitted for review" });
    expect(mocks.create).toHaveBeenCalledWith("owner-1", {
      bio: "Local guide", specialties: ["food"], cities: ["seoul"],
    });
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(mocks.configured).not.toHaveBeenCalled();
    expect(mocks.account).not.toHaveBeenCalled();
  });

  it("does not rewrite an existing application", async () => {
    preview();
    mocks.read.mockResolvedValue({ id: "application-1", clerkUserId: "owner-1", status: "pending" });
    const response = await POST(request("localley-next-preview.nkopp.workers.dev", { bio: 42 }));
    expect(await response.json()).toEqual({ status: "pending", onboarded: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses a rejected application without calling Stripe or Supabase", async () => {
    preview();
    mocks.read.mockResolvedValue({ id: "application-1", clerkUserId: "owner-1", status: "rejected" });
    const response = await POST(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("refuses invalid or oversized applications", async () => {
    preview();
    expect((await POST(request("localley-next-preview.nkopp.workers.dev", { bio: " ", cities: [] }))).status).toBe(400);
    expect((await POST(request("localley-next-preview.nkopp.workers.dev", { bio: "x".repeat(8200) }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("respects archived rejected, pending and approved profiles", async () => {
    preview();
    mocks.guides.mockResolvedValueOnce([{ clerk_user_id: "owner-1", status: "rejected" }]);
    expect((await POST(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(403);
    mocks.guides.mockResolvedValueOnce([{ clerk_user_id: "owner-1", status: "pending", stripe_account_id: null }]);
    expect(await (await POST(request("localley-next-preview.nkopp.workers.dev"))).json())
      .toEqual({ status: "pending", onboarded: false });
    mocks.guides.mockResolvedValueOnce([{ clerk_user_id: "owner-1", status: "approved", stripe_account_id: null }]);
    expect((await POST(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.account).not.toHaveBeenCalled();
  });

  it("fails closed on archive or D1 errors", async () => {
    preview();
    mocks.guides.mockRejectedValueOnce(new Error("archive missing"));
    expect((await POST(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(503);
    mocks.read.mockRejectedValueOnce(new Error("D1 missing"));
    expect((await POST(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(503);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on the existing route", async () => {
    preview();
    mocks.configured.mockReturnValue(false);
    expect((await POST(request("localley-next-preview.nkopp.workers.dev", {}, false))).status).toBe(502);
    expect((await POST(request("www.localley.io"))).status).toBe(502);
    expect(mocks.configured).toHaveBeenCalledTimes(2);
    expect(mocks.guides).not.toHaveBeenCalled();
  });
});
