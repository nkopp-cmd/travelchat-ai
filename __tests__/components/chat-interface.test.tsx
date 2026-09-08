import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInterface } from "@/components/chat/chat-interface";

const queries = vi.hoisted(() => ({
  history: {} as Record<string, { data?: { id?: string; role: string; content: string }[]; isLoading: boolean }>,
  send: vi.fn(), save: vi.fn(), create: vi.fn(), revise: vi.fn(),
}));
vi.mock("@/hooks/use-queries", () => ({
  useMessages: (id: string) => queries.history[id] || { isLoading: false },
  useConversations: () => ({ data: [] }),
  useCreateConversation: () => ({ mutate: queries.create }),
  useSaveMessage: () => ({ mutate: queries.save }),
  useSendChatMessage: () => ({ mutate: queries.send, isPending: false }),
  useReviseItinerary: () => ({ mutate: queries.revise, isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/accessibility/live-region", () => ({
  useLiveAnnouncer: () => ({ announce: vi.fn(), LiveRegionPortal: () => null }),
}));
vi.mock("@/components/chat/formatted-message", () => ({
  FormattedMessage: ({ content }: { content: string }) => <span>{content}</span>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  queries.history = {};
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

function sendMessage(content: string) {
  fireEvent.change(screen.getByLabelText("Message to Alley"), { target: { value: content } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
}

describe("ChatInterface history bootstrap", () => {
  it("loads delayed history once and retains local messages across query updates", () => {
    queries.history.first = { isLoading: true };
    const { rerender } = render(<ChatInterface conversationId="first" />);
    expect(screen.getByText("Loading conversation...")).toBeTruthy();
    queries.history.first = {
      isLoading: false, data: [{ role: "assistant", content: "Saved answer" }],
    };
    rerender(<ChatInterface conversationId="first" />);
    expect(screen.getByText("Saved answer")).toBeTruthy();
    expect(screen.queryByText(/Hey there!/)).toBeNull();
    sendMessage("More food recommendations");
    expect(queries.send.mock.calls[0][0].messages).toEqual([
      { role: "assistant", content: "Saved answer" },
      { role: "user", content: "More food recommendations" },
    ]);
    expect(queries.save).toHaveBeenCalledWith({
      conversationId: "first", role: "user", content: "More food recommendations",
    });
    act(() => queries.send.mock.calls[0][1].onSuccess({ message: "Local answer" }));
    queries.history.first = {
      isLoading: false, data: [{ id: "remote", role: "assistant", content: "Refetched answer" }],
    };
    rerender(<ChatInterface conversationId="first" />);
    expect(screen.getByText("Saved answer")).toBeTruthy();
    expect(screen.getByText("Local answer")).toBeTruthy();
    expect(screen.queryByText("Refetched answer")).toBeNull();
  });

  it.each([true, false])("does not restore history after New Chat (pending: %s)", (pending) => {
    queries.history.first = {
      isLoading: pending,
      data: pending ? undefined : [{ id: "saved", role: "assistant", content: "Saved answer" }],
    };
    const { rerender } = render(<ChatInterface conversationId="first" />);
    fireEvent.click(screen.getByRole("button", { name: "New Chat" }));
    expect(screen.queryByText("Loading conversation...")).toBeNull();
    queries.history.first = {
      isLoading: false, data: [{ id: "saved", role: "assistant", content: "Saved answer" }],
    };
    rerender(<ChatInterface conversationId="first" />);
    expect(screen.queryByText("Saved answer")).toBeNull();
    expect(screen.getByText(/Hey there!/)).toBeTruthy();
    sendMessage("Hello again");
    expect(queries.create).toHaveBeenCalledWith("Hello again", expect.any(Object));
  });

  it("starts a separate session when the conversation prop changes", () => {
    queries.history.first = { isLoading: false, data: [{ id: "a", role: "user", content: "First history" }] };
    const { rerender } = render(<ChatInterface conversationId="first" />);
    sendMessage("Old request");
    const oldSuccess = queries.send.mock.calls[0][1].onSuccess;
    queries.history.second = { isLoading: true };
    rerender(<ChatInterface conversationId="second" />);
    expect(screen.queryByText("First history")).toBeNull();
    expect(screen.queryByText("Old request")).toBeNull();
    expect(screen.getByText("Loading conversation...")).toBeTruthy();
    act(() => oldSuccess({ message: "Old response" }));
    queries.history.second = { isLoading: false, data: [{ id: "b", role: "assistant", content: "Second history" }] };
    rerender(<ChatInterface conversationId="second" />);
    expect(screen.getByText("Second history")).toBeTruthy();
    expect(screen.queryByText("Old response")).toBeNull();
    sendMessage("Current request");
    expect(queries.save).toHaveBeenLastCalledWith({ conversationId: "second", role: "user", content: "Current request" });
  });

  it("keeps the greeting for empty history and can bootstrap later history", () => {
    queries.history.first = { isLoading: false, data: [] };
    const { rerender } = render(<ChatInterface conversationId="first" />);
    expect(screen.getByText(/Hey there!/)).toBeTruthy();
    queries.history.first = { isLoading: false, data: [{ role: "user", content: "Later history" }] };
    rerender(<ChatInterface conversationId="first" />);
    expect(screen.getByText("Later history")).toBeTruthy();
    expect(screen.queryByText(/Hey there!/)).toBeNull();
  });
});
