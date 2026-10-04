import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), earnings: vi.fn(), supabase: vi.fn(), engagement: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-guide-earnings", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-guide-earnings")>(),
  previewGuideEarnings: mocks.earnings,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/engagement-tracking", () => ({ getGuideEngagement: mocks.engagement }));
import { GET } from "@/app/api/connect/earnings/route";
import { PreviewGuideNotApproved } from "@/lib/app-data/preview-guide-earnings";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });
const request = (host: string, flag = true, months = "2") => new NextRequest(
  `https://${host}/api/connect/earnings?months=${months}${flag ? "&data_candidate=d1" : ""}`);
const preview = () => { process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" }; };

describe("Connect earnings candidate route", () => {
  it("authorizes before reading the exact-owner D1 candidate", async () => {
    preview();
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "owner-1" });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(401);
    expect(mocks.earnings).not.toHaveBeenCalled();
    mocks.earnings.mockResolvedValue({ summary: { totalEarned: 0 }, currentMonth: { totalPoints: 0 }, earnings: [] });
    const response = await GET(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.earnings).toHaveBeenCalledWith("owner-1", 2);
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(mocks.engagement).not.toHaveBeenCalled();
  });

  it("rejects invalid months before D1", async () => {
    preview();
    mocks.auth.mockResolvedValue({ userId: "owner-1" });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev", true, "25"))).status).toBe(400);
    expect(mocks.earnings).not.toHaveBeenCalled();
  });

  it("preserves forbidden and fails closed on missing D1", async () => {
    preview();
    mocks.auth.mockResolvedValue({ userId: "owner-1" });
    mocks.earnings.mockRejectedValueOnce(new PreviewGuideNotApproved("inactive"));
    const denied = await GET(request("localley-next-preview.nkopp.workers.dev"));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    mocks.earnings.mockRejectedValueOnce(new Error("archive missing"));
    expect((await GET(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(503);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it.each([
    { AUTH_MAIL_MODE: undefined, SUPABASE_READ_ONLY: undefined },
    { AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: undefined },
    { AUTH_MAIL_MODE: undefined, SUPABASE_READ_ONLY: "true" },
    { AUTH_MAIL_MODE: "send", SUPABASE_READ_ONLY: "true" },
    { AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "false" },
  ])("refuses lost or unsafe settings before source and engagement reads", async settings => {
    process.env = { ...originalEnvironment, ...settings };
    mocks.auth.mockResolvedValue({ userId: "owner-1" });
    const response = await GET(request("localley-next-preview.nkopp.workers.dev", true, "25"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Guide revenue archive unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.earnings).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(mocks.engagement).not.toHaveBeenCalled();
  });

  it("keeps unsigned refusal before all readers when settings are missing", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: undefined, SUPABASE_READ_ONLY: undefined };
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev"))).status).toBe(401);
    expect(mocks.earnings).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
    expect(mocks.engagement).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    preview();
    mocks.auth.mockResolvedValue({ userId: "owner-1" });
    const single = vi.fn().mockResolvedValue({ data: { status: "approved" } });
    const limit = vi.fn().mockResolvedValue({ data: [] });
    const summary = vi.fn().mockResolvedValue({ data: [] });
    const from = vi.fn().mockImplementation((table: string) => table === "guide_profiles"
      ? { select: () => ({ eq: () => ({ single }) }) }
      : { select: (columns: string) => columns === "*"
        ? { eq: () => ({ order: () => ({ limit }) }) }
        : { eq: summary } });
    mocks.supabase.mockReturnValue({ from });
    mocks.engagement.mockResolvedValue({ totalPoints: 0 });
    const requests = [request("localley-next-preview.nkopp.workers.dev", false), request("www.localley.io"),
      request("localley.io"), request("localley-next-preview.nkopp.workers.dev.attacker.test"),
      new NextRequest("https://localley-next-preview.nkopp.workers.dev/api/connect/earnings?data_candidate=other"),
      new NextRequest("https://localley-next-preview.nkopp.workers.dev/api/connect/earnings?data_candidate=other&data_candidate=d1")];
    for (const req of requests) {
      const response = await GET(req);
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Localley-Data-Source")).toBeNull();
    }
    expect(mocks.supabase).toHaveBeenCalledTimes(requests.length);
    expect(mocks.earnings).not.toHaveBeenCalled();
  });
});
