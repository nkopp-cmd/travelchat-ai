import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), preview: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.user }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.supabase }));
vi.mock("@/lib/app-data/preview-billing-status", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-billing-status")>(),
  previewBillingStatus: mocks.preview,
}));

import { GET } from "@/app/api/subscription/status/route";

const originalEnvironment = process.env;
const previewHost = "localley-next-preview.nkopp.workers.dev";
const request = (host: string, flag = true) => new NextRequest(
  `https://${host}/api/subscription/status${flag ? "?data_candidate=d1" : ""}`,
);
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

describe("subscription status candidate route", () => {
  it("uses D1 only for a signed-in exact preview candidate", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.user.mockResolvedValue({ id: "owner-id", emailAddresses: [{ emailAddress: "owner@example.test" }] });
    mocks.preview.mockResolvedValue({ tier: "pro", status: "active", usage: { savedSpots: 2 } });
    const response = await GET(request(previewHost));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ tier: "pro", usage: { savedSpots: 2 } });
    expect(mocks.preview).toHaveBeenCalledWith("owner-id", "owner@example.test");
    expect(mocks.supabase).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ id: "other-id", emailAddresses: [] });
    expect((await GET(request(previewHost))).status).toBe(401);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });

  it("keeps normal preview and www on the existing Supabase repository", async () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true", BETA_MODE: "false" };
    mocks.auth.mockResolvedValue({ userId: "owner-id" });
    mocks.user.mockResolvedValue({ id: "owner-id", emailAddresses: [] });
    const from = vi.fn((table: string) => {
      if (table === "subscriptions") return { select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) };
      const result = table === "saved_spots" ? { count: 0 } : { data: [] };
      const query = { eq: vi.fn(), then: (resolve: (value: unknown) => void) => resolve(result) };
      query.eq.mockReturnValue(query);
      return { select: () => query };
    });
    mocks.supabase.mockResolvedValue({ from });
    const www = await GET(request("www.localley.io"));
    const normal = await GET(request(previewHost, false));
    expect(www.status).toBe(200);
    expect(normal.status).toBe(200);
    expect((await normal.json()).tier).toBe("free");
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(www.headers.get("X-Localley-Data-Source")).toBeNull();
  });
});
