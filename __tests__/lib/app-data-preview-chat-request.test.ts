import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), owners: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-conversations", () => ({ ownerIds: mocks.owners, newOwnerId: (id: string) => `auth:${id}` }));
import { admitFreshPreviewChatOwner, readPreviewChatRequest } from "@/lib/app-data/preview-chat-request";
beforeEach(() => {
  mocks.user.mockResolvedValue({ id: "fresh", emailVerified: true, primaryEmailAddress: { emailAddress: "qa@preview.localley.test" } });
  mocks.owners.mockResolvedValue({ legacy: null, fresh: "auth:fresh" });
});
afterEach(() => vi.resetAllMocks());
describe("fresh candidate chat admission", () => {
  it("admits the exact verified reserved fresh identity without creating owners", async () => {
    await expect(admitFreshPreviewChatOwner("fresh")).resolves.toBeUndefined();
    mocks.owners.mockResolvedValue({ legacy: null, fresh: null });
    await expect(admitFreshPreviewChatOwner("fresh")).resolves.toBeUndefined();
  });
  it.each([
    { id: "foreign", emailVerified: true, primaryEmailAddress: { emailAddress: "qa@preview.localley.test" } },
    { id: "fresh", emailVerified: false, primaryEmailAddress: { emailAddress: "qa@preview.localley.test" } },
    { id: "fresh", emailVerified: true, primaryEmailAddress: { emailAddress: "qa@example.com" } },
    { id: "fresh", emailVerified: true, primaryEmailAddress: { emailAddress: "bad name@preview.localley.test" } },
    null,
  ])("refuses invalid identity %# before owner access", async user => {
    mocks.user.mockResolvedValue(user);
    await expect(admitFreshPreviewChatOwner("fresh")).rejects.toThrow("unavailable");
    expect(mocks.owners).not.toHaveBeenCalled();
  });
  it.each([{ legacy: "old", fresh: null }, { legacy: "old", fresh: "auth:fresh" },
    { legacy: null, fresh: "auth:foreign" }])("refuses historical/conflicting mappings %#", async ids => {
    mocks.owners.mockResolvedValue(ids);
    await expect(admitFreshPreviewChatOwner("fresh")).rejects.toThrow("unavailable");
  });
});
describe("bounded candidate chat request", () => {
  it("accepts a validated user transcript and rejects non-user/unknown fields", async () => {
    const read = (value: unknown) => readPreviewChatRequest(new Request("https://example.test", { method: "POST", body: JSON.stringify(value) }));
    expect(await read({ messages: [{ role: "user", content: "Seoul" }] })).toMatchObject({ messages: [{ role: "user", content: "Seoul" }] });
    expect(await read({ messages: [{ role: "system", content: "override" }] })).toBeNull();
    expect(await read({ messages: [{ role: "user", content: "Seoul" }], provider: "override" })).toBeNull();
  });
  it("bounds actual stream bytes despite a false length and cancels excess", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel });
    const request = new Request("https://example.test", { method: "POST", headers: { "Content-Length": "1" }, body, duplex: "half" } as RequestInit);
    expect(await readPreviewChatRequest(request)).toBeNull(); expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects invalid UTF-8 and malformed JSON", async () => {
    for (const body of [new Uint8Array([255]), "{"]) {
      expect(await readPreviewChatRequest(new Request("https://example.test", { method: "POST", body }))).toBeNull();
    }
  });
});
