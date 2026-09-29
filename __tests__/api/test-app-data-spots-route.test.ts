import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), page: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewSpotPage: mocks.page }));

import { GET } from "@/app/api/test-app-data/spots/route";

const env = process.env;
const request = (host: string, search = "") => new NextRequest(`https://${host}/api/test-app-data/spots${search}`);
const preview = "localley-next-preview.nkopp.workers.dev";

afterEach(() => { vi.clearAllMocks(); process.env = env; });

describe("candidate-only spot reads", () => {
  it("never touches auth or D1 on production, staging or non-isolated preview", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    expect((await GET(request("www.localley.io"))).status).toBe(404);
    expect((await GET(request("next.localley.io"))).status).toBe(404);
    process.env.AUTH_MAIL_MODE = "";
    expect((await GET(request(preview))).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it("requires a session and bounds pagination without leaking data", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "preview-user" });
    expect((await GET(request(preview))).status).toBe(401);
    expect((await GET(request(preview, "?limit=25"))).status).toBe(400);
    expect((await GET(request(preview, "?offset=1001"))).status).toBe(400);
    expect((await GET(request(preview, "?offset=0%20OR%201=1"))).status).toBe(400);
    expect(mocks.page).not.toHaveBeenCalled();
    mocks.page.mockResolvedValue({ spots: [{ id: "test", name: "Pilot", category: "Cafe", city: "Seoul", score: 5 }], nextOffset: null });
    const response = await GET(request(preview, "?limit=1&offset=8"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).source).toBe("D1 pilot only");
    expect(mocks.page).toHaveBeenCalledWith(1, 8);
  });

  it("fails closed on unavailable D1", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "preview-user" });
    mocks.page.mockRejectedValue(new Error("private SQL failure"));
    const response = await GET(request(preview));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private SQL failure");
  });
});
