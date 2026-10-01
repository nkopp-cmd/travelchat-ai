import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), save: vi.fn(), send: vi.fn(), revise: vi.fn() }));
vi.mock("@/hooks/use-queries", () => ({
 useCreateConversation: () => ({ mutateAsync: mocks.create }), useSaveMessage: () => ({ mutateAsync: mocks.save }),
 useSendChatMessage: () => ({ mutateAsync: mocks.send, isPending: false }), useReviseItinerary: () => ({ mutateAsync: mocks.revise, isPending: false }),
 useMessages: () => ({ data: [], isLoading: false }), useConversations: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/accessibility/live-region", () => ({ useLiveAnnouncer: () => ({ announce: vi.fn(), LiveRegionPortal: () => null }) }));
vi.mock("@/components/chat/formatted-message", () => ({ FormattedMessage: ({ content }: { content: string }) => <span>{content}</span> }));
import { ChatInterface } from "@/components/chat/chat-interface";
beforeEach(() => {
 vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn();
 mocks.create.mockResolvedValue({ id: "exchange-one" }); mocks.save.mockResolvedValue({}); mocks.send.mockResolvedValue({ message: "One real reply" });
});
function submit() { fireEvent.change(document.querySelector("#chat-input")!, { target: { value: "Hello Alley" } }); fireEvent.click(screen.getByRole("button", { name: "Send message" })); }
describe("persisted chat exchange", () => {
 it("creates one conversation and saves both roles in order despite fast model replies", async () => {
 let resolve!: (value: { id: string }) => void; mocks.create.mockImplementation(() => new Promise(r => { resolve = r; }));
 render(<ChatInterface />); submit(); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
 await act(async () => resolve({ id: "exchange-one" })); await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
 expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.save.mock.calls.map(call => call[0])).toEqual([
 { conversationId: "exchange-one", role: "user", content: "Hello Alley" }, { conversationId: "exchange-one", role: "assistant", content: "One real reply" }]);
 });
 it("retains the selected conversation for both roles", async () => {
 render(<ChatInterface conversationId="existing-owner-conversation" />); submit(); await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
 expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save.mock.calls.every(call => call[0].conversationId === "existing-owner-conversation")).toBe(true);
 });
 it("does not call a paid model when the user's message cannot be saved", async () => {
 mocks.save.mockRejectedValue(new Error("Storage refused")); render(<ChatInterface />); submit();
 expect((await screen.findByRole("alert")).textContent).toBe("Your message could not be saved. Alley has not received it yet."); expect(mocks.send).not.toHaveBeenCalled();
 });
 it("keeps a visible reply and reports failed history persistence without another model call", async () => {
 mocks.save.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Save refused")); render(<ChatInterface />); submit();
 expect((await screen.findByRole("alert")).textContent).toBe("Your reply is shown here, but chat history could not save it. Keep this page open.");
 expect(screen.getByText("One real reply")).toBeTruthy(); expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.create).toHaveBeenCalledTimes(1);
 });
 it("does not start another conversation while an exchange is in flight", async () => {
 let resolve!: (value: { id: string }) => void; mocks.create.mockImplementation(() => new Promise(r => { resolve = r; }));
 render(<ChatInterface />); submit(); fireEvent.click(screen.getByRole("button", { name: "New Chat" }));
 expect(mocks.create).toHaveBeenCalledTimes(1); expect(screen.getByText("Hello Alley")).toBeTruthy();
 await act(async () => resolve({ id: "exchange-one" })); await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2)); expect(mocks.create).toHaveBeenCalledTimes(1);
 });
 it("never retries an uncertain model response and keeps the saved user message", async () => {
 mocks.send.mockRejectedValue(new Error("Provider response unavailable")); render(<ChatInterface />); submit();
 expect((await screen.findByRole("alert")).textContent).toBe("Your message was saved, but Alley could not finish this reply."); expect(mocks.send).toHaveBeenCalledTimes(1); expect(mocks.save).toHaveBeenCalledTimes(1);
 });
 it("keeps itinerary revision replies in the same persisted conversation", async () => {
 mocks.revise.mockResolvedValue({}); render(<ChatInterface itineraryContext={{ id: "trip", title: "My trip", city: "Seoul", days: 1 }} />); submit();
 await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2)); expect(mocks.revise).toHaveBeenCalledWith({ id: "trip", revisionRequest: "Hello Alley" });
 expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.save.mock.calls.every(call => call[0].conversationId === "exchange-one")).toBe(true);
 });

});
