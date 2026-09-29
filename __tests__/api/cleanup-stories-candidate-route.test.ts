import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ cleanup: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/app-data/preview-story-cleanup", () => ({ cleanupPreviewStories: mocks.cleanup }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
import { GET } from "@/app/api/cron/cleanup-stories/route";

const environment = process.env;
const preview = "localley-next-preview.nkopp.workers.dev";
const request = (host: string, candidate = true, authorized = true) => new NextRequest(
  `https://${host}/api/cron/cleanup-stories${candidate ? "?data_candidate=d1" : ""}`,
  { headers: authorized ? { authorization: "Bearer preview-test-cron" } : {} },
);
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("story cleanup cron candidate", () => {
  it("requires the cron secret before touching D1", async () => {
    process.env = { ...environment, CRON_SECRET: "preview-test-cron",
      AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    expect((await GET(request(preview, true, false))).status).toBe(401);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("returns the existing cleanup shape from D1 only for the exact preview candidate", async () => {
    process.env = { ...environment, CRON_SECRET: "preview-test-cron",
      AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.cleanup.mockResolvedValue({ success: true, cleaned: 1, filesDeleted: 1, total: 1 });
    const response = await GET(request(preview));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await response.json()).toEqual({ success: true, cleaned: 1, filesDeleted: 1, total: 1 });
    expect(mocks.supabase).not.toHaveBeenCalled();
    mocks.cleanup.mockRejectedValue(new Error("R2 unavailable"));
    expect((await GET(request(preview))).status).toBe(500);
  });

  it("keeps normal preview and www on the existing Supabase route", async () => {
    process.env = { ...environment, CRON_SECRET: "preview-test-cron",
      AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const query = { select: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.supabase.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    expect((await GET(request(preview, false))).status).toBe(200);
    expect((await GET(request("www.localley.io"))).status).toBe(200);
    expect((await GET(request("localley.internal"))).status).toBe(200);
    expect(mocks.supabase).toHaveBeenCalledTimes(3);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
});
