// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => { throw new Error(`redirect ${url}`); }),
  notFound: vi.fn(() => { throw new Error("not found"); }),
  admin: vi.fn((userId: string | null) => userId === "admin-1"),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/lib/admin-auth", () => ({ isAdminUser: mocks.admin }));
import { canUseCommunity, requireCommunityPage } from "@/lib/community/access";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("community access (COMMUNITY_PUBLIC)", () => {
  it("admin-only while closed: everyone else gets a 404, signed-out visitors too", async () => {
    vi.stubEnv("COMMUNITY_PUBLIC", "");
    expect(canUseCommunity("user-1")).toBe(false);
    expect(canUseCommunity("admin-1")).toBe(true);
    await expect(requireCommunityPage(null, "/community")).rejects.toThrow("not found");
    await expect(requireCommunityPage("user-1", "/community")).rejects.toThrow("not found");
    await expect(requireCommunityPage("admin-1", "/community")).resolves.toBe("admin-1");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("public: signed-in users enter, signed-out visitors sign in and come back to the page", async () => {
    vi.stubEnv("COMMUNITY_PUBLIC", "true");
    expect(canUseCommunity("user-1")).toBe(true);
    await expect(requireCommunityPage("user-1", "/community")).resolves.toBe("user-1");
    await expect(requireCommunityPage(null, async () => "/spots/abc/tips")).rejects.toThrow("redirect /sign-in?redirect_url=%2Fspots%2Fabc%2Ftips");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("only the exact string true opens it", () => {
    vi.stubEnv("COMMUNITY_PUBLIC", "1");
    expect(canUseCommunity("user-1")).toBe(false);
  });
});
