import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), owners: vi.fn(), guides: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-conversations", () => ({ ownerIds: mocks.owners, newOwnerId: (id: string) => `auth:${id}` }));
vi.mock("@/lib/app-data/preview-admin-guides", () => ({ previewAdminGuides: mocks.guides }));
vi.mock("@/lib/app-data/preview-guide-application", () => ({ readPreviewGuideApplication: mocks.read }));
import { previewGuideApplicationPage } from "@/lib/app-data/preview-guide-application-page";
const user = { id: "fresh", emailVerified: true, primaryEmailAddress: { emailAddress: "guide@preview.localley.test" } };
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue(user); mocks.owners.mockResolvedValue({ legacy: null, fresh: null }); mocks.guides.mockResolvedValue([]); mocks.read.mockResolvedValue(null); });
describe("guide application page ownership", () => {
  it("allows a verified fresh reserved user without creating an APP owner", async () => {
    expect(await previewGuideApplicationPage()).toEqual({ kind: "new" }); expect(mocks.owners).toHaveBeenCalledWith("fresh"); expect(mocks.read).toHaveBeenCalledWith("fresh");
  });
  it("returns only the owned pending display fields", async () => {
    mocks.owners.mockResolvedValue({ legacy: null, fresh: "auth:fresh" });
    mocks.read.mockResolvedValue({ clerkUserId: "fresh", status: "pending", bio: "Owned biography", cities: ["seoul"], specialties: ["food"], reviewedBy: "private admin" });
    expect(await previewGuideApplicationPage()).toEqual({ kind: "pending", bio: "Owned biography", cities: ["seoul"], specialties: ["food"] });
  });
  it.each([null, { ...user, emailVerified: false }, { ...user, primaryEmailAddress: { emailAddress: "guide@localley.io" } }, { ...user, primaryEmailAddress: { emailAddress: "@preview.localley.test" } }])("refuses missing, unverified or non-reserved identities", async value => {
    mocks.user.mockResolvedValue(value); await expect(previewGuideApplicationPage()).rejects.toThrow("Guide preview unavailable"); expect(mocks.owners).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([{ legacy: "historic", fresh: null }, { legacy: "historic", fresh: "auth:fresh" }, { legacy: null, fresh: "auth:foreign" }])("refuses historical or conflicting owner links", async owners => {
    mocks.owners.mockResolvedValue(owners); await expect(previewGuideApplicationPage()).rejects.toThrow(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("refuses an archived guide before reading a fresh application", async () => {
    mocks.guides.mockResolvedValue([{ clerk_user_id: "fresh" }]); await expect(previewGuideApplicationPage()).rejects.toThrow(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([{ clerkUserId: "foreign", status: "pending", bio: "Private" }, { clerkUserId: "fresh", status: "rejected", bio: "Rejected" }])("refuses foreign and rejected rows", async row => {
    mocks.read.mockResolvedValue(row); await expect(previewGuideApplicationPage()).rejects.toThrow();
  });
  it("contains unavailable D1 instead of inventing a new application", async () => {
    mocks.read.mockRejectedValue(new Error("D1 unavailable")); await expect(previewGuideApplicationPage()).rejects.toThrow();
  });
});
