import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), owners: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-conversations", () => ({ ownerIds: mocks.owners, newOwnerId: (id: string) => `new:${id}` }));
import { previewSavedSpotActor } from "@/lib/app-data/preview-saved-spot-actor";
const user = { id: "a", emailVerified: true, primaryEmailAddress: { emailAddress: "save-a@preview.localley.test" } };
afterEach(() => vi.resetAllMocks());
describe("candidate save control admission", () => {
  it.each([null, { legacy: null, fresh: null }, { legacy: null, fresh: "new:a" }])("admits only a verified reserved owner without creating one: %j", async ids => {
    mocks.user.mockResolvedValue(user); mocks.owners.mockResolvedValue(ids ?? { legacy: null, fresh: null });
    expect(await previewSavedSpotActor()).toBe("a"); expect(mocks.owners).toHaveBeenCalledWith("a");
  });
  it.each([null, { ...user, emailVerified: false }, { ...user, primaryEmailAddress: { emailAddress: "a@example.com" } }])("refuses invalid identity %j before D1", async value => {
    mocks.user.mockResolvedValue(value); expect(await previewSavedSpotActor()).toBeNull(); expect(mocks.owners).not.toHaveBeenCalled();
  });
  it.each([{ legacy: "old", fresh: null }, { legacy: null, fresh: "new:other" }])("refuses historical or foreign mappings %j", async ids => {
    mocks.user.mockResolvedValue(user); mocks.owners.mockResolvedValue(ids); expect(await previewSavedSpotActor()).toBeNull();
  });
});
