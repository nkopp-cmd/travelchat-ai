import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), preview: vi.fn(), supabase: vi.fn(), stripe: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-guide-status", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-guide-status")>(),
  previewGuideStatus: mocks.preview,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/stripe-connect", () => ({ getAccountStatus: mocks.stripe }));
import { GET } from "@/app/api/connect/status/route";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });
const request = (host: string, flag = true) => new NextRequest(
  `https://${host}/api/connect/status${flag ? "?data_candidate=d1" : ""}`);

describe("Connect status candidate route", () => {
  it("authorizes before reading the exact preview D1 candidate", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(401);
    expect(mocks.preview).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ userId: "owner-1" });
    mocks.preview.mockResolvedValue({ isGuide: false });
    const response = await GET(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({ isGuide: false });
    expect(mocks.preview).toHaveBeenCalledWith("owner-1");
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it("fails closed when archive validation fails", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "owner-1" });
    mocks.preview.mockRejectedValue(new Error("Guide archive count mismatch"));
    const response = await GET(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "owner-1" });
    const single = vi.fn().mockResolvedValue({ data: null });
    mocks.supabase.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ single }) }) }) });
    const normal = await GET(request("localley-next-preview.nkopp.workers.dev", false));
    const www = await GET(request("www.localley.io"));
    expect(normal.status).toBe(200);
    expect(www.status).toBe(200);
    expect(await normal.json()).toEqual({ isGuide: false });
    expect(normal.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
