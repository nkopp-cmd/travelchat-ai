import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), admit: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-chat-request", () => ({ admitFreshPreviewChatOwner: mocks.admit }));
vi.mock("@/lib/app-data/preview-conversations", () => ({ previewConversations: mocks.read }));
import { previewChatHistoryPage } from "@/lib/app-data/preview-chat-history-page";
const id = "12345678-1234-1234-1234-123456789abc";
const messageId = "22345678-1234-1234-1234-123456789abc";
const row = () => ({ id, title: "Owned Seoul chat", messages: [{ id: messageId, role: "assistant", content: "Keep daylight for the river walk." }] });
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: "fresh" }); mocks.admit.mockResolvedValue(undefined); mocks.read.mockResolvedValue({ conversations: [row()] }); });
describe("fresh candidate chat history", () => {
  it("admits the actor before reading and returns only message display fields", async () => {
    const state = await previewChatHistoryPage(id);
    expect(mocks.admit).toHaveBeenCalledWith("fresh"); expect(mocks.read).toHaveBeenCalledWith("fresh");
    expect(mocks.admit.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[0]);
    expect(state).toEqual({ kind: "history", conversations: [{ id, title: "Owned Seoul chat" }], selected: row() });
  });
  it("uses the first owned conversation when no selection is supplied", async () => { expect(await previewChatHistoryPage()).toMatchObject({ selected: { id } }); });
  it("returns the real empty state without owner creation", async () => { mocks.read.mockResolvedValue({ conversations: [] }); expect(await previewChatHistoryPage()).toEqual({ kind: "history", conversations: [], selected: null }); });
  it("refuses an anonymous actor before any admission or read", async () => { mocks.user.mockResolvedValue(null); await expect(previewChatHistoryPage()).rejects.toThrow(); expect(mocks.admit).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); });
  it.each(["unverified", "historical owner", "conflicting owner", "D1 missing"])("contains %s admission failures", async message => { mocks.admit.mockRejectedValue(new Error(message)); await expect(previewChatHistoryPage()).rejects.toThrow(); expect(mocks.read).not.toHaveBeenCalled(); });
  it.each(["foreign", "", [id], "x".repeat(1000)])("refuses malformed selection before private reads", async value => { await expect(previewChatHistoryPage(value)).rejects.toThrow(); expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled(); });
  it("refuses a foreign or absent UUID without exposing owned lists", async () => { await expect(previewChatHistoryPage(messageId)).rejects.toThrow(); });
  it("does not mistake unavailable storage for an empty history", async () => { mocks.read.mockRejectedValue(new Error("D1 offline")); await expect(previewChatHistoryPage()).rejects.toThrow(); });
  it.each([{ ...row(), id: "bad" }, { ...row(), title: "x".repeat(201) }, { ...row(), messages: [{ id: messageId, role: "system", content: "Private system content" }] }, { ...row(), messages: [{ id: messageId, role: "user", content: "한".repeat(22000) }] }])("refuses malformed display data", async value => { mocks.read.mockResolvedValue({ conversations: [value] }); await expect(previewChatHistoryPage()).rejects.toThrow(); });
});
