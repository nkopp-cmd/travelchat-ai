import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), candidate: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-leaderboard", async original => ({
  ...await original<typeof import("@/lib/app-data/preview-leaderboard")>(),
  previewLeaderboard: mocks.candidate,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
import { GET } from "@/app/api/leaderboard/route";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });
const preview = () => { process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" }; };
const request = (host: string, query = "?data_candidate=d1&limit=2") => GET(new NextRequest(
  `https://${host}/api/leaderboard${query}`));

describe("historical leaderboard candidate route", () => {
  it("serves anonymous and signed-in preview reads from D1", async () => {
    preview(); mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "owner" });
    mocks.candidate.mockResolvedValue({ leaderboard: [{ rank: 1, id: "profile", isCurrentUser: false }],
      currentUserRank: null });
    const anonymous = await request("localley-next-preview.nkopp.workers.dev");
    const signedIn = await request("localley-next-preview.nkopp.workers.dev");
    expect(anonymous.status).toBe(200);
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ success: true, total: 1,
      leaderboard: [{ rank: 1 }], currentUserRank: null });
    expect(signedIn.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(signedIn.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.candidate.mock.calls).toEqual([[null, 2], ["owner", 2]]);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("refuses invalid or incomplete candidate data without Supabase fallback", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "owner" });
    expect((await request("localley-next-preview.nkopp.workers.dev", "?data_candidate=d1&limit=101")).status)
      .toBe(400);
    mocks.candidate.mockRejectedValue(new Error("incomplete archive"));
    const unavailable = await request("localley-next-preview.nkopp.workers.dev");
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: null });
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    mocks.supabase.mockReturnValue({ from: vi.fn(() => ({ select: () => ({ order: () => ({ limit }) }) })) });
    const normal = await request("localley-next-preview.nkopp.workers.dev", "?limit=2");
    const www = await request("www.localley.io");
    expect(normal.status).toBe(200);
    expect(www.status).toBe(200);
    expect(normal.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.candidate).not.toHaveBeenCalled();
  });
});
