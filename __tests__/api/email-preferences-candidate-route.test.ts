import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), read: vi.fn(), write: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.supabase }));
vi.mock("@/lib/app-data/preview-email-preferences", async original => ({
  ...await original<typeof import("@/lib/app-data/preview-email-preferences")>(),
  previewEmailPreferences: mocks.read,
  updatePreviewEmailPreferences: mocks.write,
}));
import { GET, PUT } from "@/app/api/user/email-preferences/route";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });
const defaults = { marketing: true, weekly_digest: true, product_updates: true, itinerary_shared: true };
const preview = () => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.currentUser.mockResolvedValue({ id: "user-a", emailVerified: true,
    primaryEmailAddress: { emailAddress: "agent@preview.localley.test" } });
};
const request = (host: string, method: "GET" | "PUT", flag = true, preferences: unknown = { marketing: false }) =>
  new NextRequest(`https://${host}/api/user/email-preferences${flag ? "?data_candidate=d1" : ""}`,
    method === "GET" ? { method } : { method, body: JSON.stringify({ preferences }) });

describe("email preference candidate route", () => {
  it("requires auth before any D1 read or write", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev", "GET"))).status).toBe(401);
    expect((await PUT(request("localley-next-preview.nkopp.workers.dev", "PUT"))).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("reads and writes preview D1 with private headers", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "user-a" });
    mocks.read.mockResolvedValue(defaults);
    mocks.write.mockResolvedValue({ ...defaults, marketing: false });
    const read = await GET(request("localley-next-preview.nkopp.workers.dev", "GET"));
    const write = await PUT(request("localley-next-preview.nkopp.workers.dev", "PUT"));
    expect(read.status).toBe(200);
    expect(write.status).toBe(200);
    expect(await read.json()).toEqual({ preferences: defaults });
    expect(await write.json()).toEqual({ success: true, preferences: { ...defaults, marketing: false } });
    expect(read.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(write.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.read).toHaveBeenCalledWith("user-a");
    expect(mocks.write).toHaveBeenCalledWith("user-a", { marketing: false });
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("rejects invalid changes and refuses incomplete D1 without Supabase fallback", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "user-a" });
    expect((await PUT(request("localley-next-preview.nkopp.workers.dev", "PUT", true,
      { marketing: "false" }))).status).toBe(400);
    mocks.read.mockRejectedValue(new Error("missing source"));
    mocks.write.mockRejectedValue(new Error("missing source"));
    expect((await GET(request("localley-next-preview.nkopp.workers.dev", "GET"))).status).toBe(503);
    expect((await PUT(request("localley-next-preview.nkopp.workers.dev", "PUT"))).status).toBe(503);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("refuses real or unverified preview users before reading or writing consent", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "user-a" });
    for (const user of [
      { id: "user-a", emailVerified: true, primaryEmailAddress: { emailAddress: "real@example.com" } },
      { id: "user-a", emailVerified: false,
        primaryEmailAddress: { emailAddress: "agent@preview.localley.test" } },
      { id: "other", emailVerified: true,
        primaryEmailAddress: { emailAddress: "agent@preview.localley.test" } },
    ]) {
      mocks.currentUser.mockResolvedValue(user);
      expect((await GET(request("localley-next-preview.nkopp.workers.dev", "GET"))).status).toBe(503);
      expect((await PUT(request("localley-next-preview.nkopp.workers.dev", "PUT"))).status).toBe(503);
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "user-a" });
    mocks.supabase.mockResolvedValue({ from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { email_preferences: defaults } }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }) });
    const normal = await GET(request("localley-next-preview.nkopp.workers.dev", "GET", false));
    const www = await PUT(request("www.localley.io", "PUT"));
    expect(normal.status).toBe(200);
    expect(www.status).toBe(200);
    expect(normal.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
