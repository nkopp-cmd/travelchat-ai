import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-story-metadata", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-story-metadata")>(),
  previewStoryBackgrounds: mocks.read, updatePreviewStoryBackgrounds: mocks.write,
}));

import { GET, PATCH } from "@/app/api/test-app-data/stories/[id]/route";

const env = process.env;
const id = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id }) };
const request = (host: string, method = "GET", body?: object) => new NextRequest(
  `https://${host}/api/test-app-data/stories/${id}`,
  { method, ...(body ? { body: JSON.stringify(body) } : {}) },
);
const preview = "localley-next-preview.nkopp.workers.dev";

afterEach(() => { vi.clearAllMocks(); process.env = env; });

describe("candidate story metadata route", () => {
  it("does not authenticate or read or write on production", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    expect((await GET(request("www.localley.io"), params)).status).toBe(404);
    expect((await PATCH(request("next.localley.io", "PATCH", { cover: "/images/a.png" }), params)).status).toBe(404);
    process.env.AUTH_MAIL_MODE = "";
    expect((await GET(request(preview), params)).status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("requires an account and accepts only bounded image fields", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "owner-id" });
    expect((await GET(request(preview), params)).status).toBe(401);
    expect((await PATCH(request(preview, "PATCH", { day31: "/images/a.png" }), params)).status).toBe(400);
    expect((await PATCH(request(preview, "PATCH", { cover: "http://localhost/a.png" }), params)).status).toBe(400);
    expect((await PATCH(request(preview, "PATCH", { cover: "https://example.com/a.png" }), params)).status).toBe(400);
    expect((await PATCH(request(preview, "PATCH", { cover: "/images/../private.png" }), params)).status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
    mocks.write.mockResolvedValue({ cover: "/images/a.png" });
    const result = await PATCH(request(preview, "PATCH", { cover: "/images/a.png" }), params);
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.write).toHaveBeenCalledWith(id, "owner-id", { cover: "/images/a.png" });
  });

  it("hides other owners and SQL failures", async () => {
    process.env = { ...env, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
    mocks.auth.mockResolvedValue({ userId: "different-owner" });
    mocks.read.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("private SQL"));
    expect((await GET(request(preview), params)).status).toBe(404);
    const response = await GET(request(preview), params);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private SQL");
    expect(mocks.read).toHaveBeenCalledWith(id, "different-owner");
  });
});
