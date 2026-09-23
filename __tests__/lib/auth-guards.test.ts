// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));

describe("admin guard (ADMIN_USER_IDS)", () => {
  beforeEach(() => { vi.resetModules(); mocks.auth.mockReset(); });

  async function load(ids: string) {
    process.env.ADMIN_USER_IDS = ids;
    return import("@/lib/admin-auth");
  }

  it("returns 401 when signed out", async () => {
    const { requireAdmin } = await load("user_admin");
    mocks.auth.mockResolvedValue({ userId: null, sessionId: null });
    const result = await requireAdmin("/api/admin/test");
    expect(result.response?.status).toBe(401);
  });

  it("returns 403 for a signed-in non-admin", async () => {
    const { requireAdmin } = await load("user_admin");
    mocks.auth.mockResolvedValue({ userId: "user_other", sessionId: "s" });
    expect((await requireAdmin("/api/admin/test")).response?.status).toBe(403);
  });

  it("authorizes a listed id (old Clerk ids stay valid)", async () => {
    const { requireAdmin, isAdminUser } = await load(" user_admin , user_second ");
    mocks.auth.mockResolvedValue({ userId: "user_second", sessionId: "s" });
    const result = await requireAdmin("/api/admin/test");
    expect(result).toEqual({ response: null, userId: "user_second" });
    expect(isAdminUser("user_admin")).toBe(true);
    expect(isAdminUser(null)).toBe(false);
  });
});

describe("Supabase RLS token", () => {
  beforeEach(() => { vi.resetModules(); mocks.currentUser.mockReset(); });

  it("mints the same claims as the Clerk supabase template", async () => {
    const { mintSupabaseAccessToken } = await import("@/lib/supabase-server");
    const secret = "super-secret-jwt-token-with-at-least-32-characters";
    const token = await mintSupabaseAccessToken({ id: "user_38VRabc", email: "a@b.test" }, secret);
    const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret), { audience: "authenticated" });
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload).toMatchObject({ sub: "user_38VRabc", role: "authenticated", aud: "authenticated", email: "a@b.test" });
    expect(payload.exp! - payload.iat!).toBe(60);
  });

  it("falls back to the anon client without SUPABASE_JWT_SECRET or without a user", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    delete process.env.SUPABASE_JWT_SECRET;
    const { createSupabaseServerClient } = await import("@/lib/supabase-server");
    await expect(createSupabaseServerClient()).resolves.toBeTruthy();
    expect(mocks.currentUser).not.toHaveBeenCalled();
    process.env.SUPABASE_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters";
    mocks.currentUser.mockResolvedValue(null);
    await expect(createSupabaseServerClient()).resolves.toBeTruthy();
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);
    delete process.env.SUPABASE_JWT_SECRET;
  });
});
