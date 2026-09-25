import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), counts: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataCounts: mocks.counts }));

import { GET } from "@/app/api/test-app-data/route";

const env = process.env;
const request = (host = "localley-next-preview.nkopp.workers.dev") =>
  new NextRequest(`https://${host}/api/test-app-data`);

afterEach(() => {
  vi.clearAllMocks();
  process.env = env;
});

describe("preview-only D1 count probe", () => {
  it("does not read auth or D1 on production or without preview gates", async () => {
    process.env = { ...env, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    expect((await GET(request("www.localley.io"))).status).toBe(404);
    expect((await GET(request("next.localley.io"))).status).toBe(404);
    process.env.SUPABASE_READ_ONLY = "false";
    expect((await GET(request())).status).toBe(404);
    process.env.SUPABASE_READ_ONLY = "true";
    process.env.AUTH_MAIL_MODE = "";
    expect((await GET(request())).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.counts).not.toHaveBeenCalled();
  });

  it("requires a signed-in Better Auth session", async () => {
    process.env = { ...env, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.counts).not.toHaveBeenCalled();
  });

  it("returns bounded counts from APP_DATA_PREVIEW_DB with no cache", async () => {
    process.env = { ...env, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "preview-test-user" });
    mocks.counts.mockResolvedValue({ publishedSpots: 8, importedBatches: 0 });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ source: "D1 pilot only", publishedSpots: 8, importedBatches: 0 });
    expect(mocks.counts).toHaveBeenCalledTimes(1);
  });

  it("hides database errors without false readiness", async () => {
    process.env = { ...env, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "preview-test-user" });
    mocks.counts.mockRejectedValue(new Error("private SQL error"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private SQL error");
  });
});
