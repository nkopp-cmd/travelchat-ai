import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), live: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.live }));
vi.mock("@/lib/app-data/preview-user-tier", () => ({ previewUserTier: mocks.preview }));
import { GET } from "@/app/api/user/tier/route";
const preview = "https://localley-next-preview.nkopp.workers.dev/api/user/tier?data_candidate=d1";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("AUTH_MAIL_MODE", "outbox"); vi.stubEnv("SUPABASE_READ_ONLY", "true");
  mocks.auth.mockResolvedValue({ userId: "auth-owner" });
  mocks.live.mockResolvedValue("pro"); mocks.preview.mockResolvedValue("premium");
});
afterEach(() => vi.unstubAllEnvs());
describe("candidate user tier route", () => {
  it("uses D1 only for the exact flagged preview", async () => {
    const r = await GET(new NextRequest(preview));
    expect(await r.json()).toEqual({ tier: "premium" });
    expect(r.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.preview).toHaveBeenCalledWith("auth-owner");
    expect(mocks.live).not.toHaveBeenCalled();
  });
  it("keeps www, unflagged preview and mismatched flags on the normal repository", async () => {
    for (const url of [preview.replace("localley-next-preview.nkopp.workers.dev", "www.localley.io"), preview.split("?")[0]]) {
      expect(await (await GET(new NextRequest(url))).json()).toEqual({ tier: "pro" });
    }
    vi.stubEnv("AUTH_MAIL_MODE", "send");
    expect(await (await GET(new NextRequest(preview))).json()).toEqual({ tier: "pro" });
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("denies signed-out candidates before reading a tier", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(new NextRequest(preview))).status).toBe(401);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("fails incomplete candidates closed instead of granting a free tier", async () => {
    mocks.preview.mockRejectedValue(new Error("incomplete"));
    const r = await GET(new NextRequest(preview));
    expect(r.status).toBe(503); expect(await r.json()).toEqual({ error: "Preview tier unavailable" });
    expect(mocks.live).not.toHaveBeenCalled();
  });
});
