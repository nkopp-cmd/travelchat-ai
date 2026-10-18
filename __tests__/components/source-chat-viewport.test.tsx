import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SourceChatPage from "@/components/chat/source-chat-page";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/chat/chat-interface", () => ({ ChatInterface: () => <div role="region" aria-label="Chat with Alley">Composer</div> }));
vi.mock("@/components/chat/recent-conversations-panel", () => ({ RecentConversationsPanel: () => null }));
describe("interactive chat viewport", () => {
  it("bounds the actual chat page, with shared header and safe-area navigation tokens", () => {
    render(<SourceChatPage />);
    const background = screen.getByRole("region", { name: "Chat with Alley" }).closest(".page-premium") as HTMLElement;
    expect(background).not.toBeNull();
    expect(background.className).toContain("h-[calc(100dvh-var(--ll-topbar-height)-var(--ll-nav-clearance))]");
    expect(background.className).not.toMatch(/\dpx/);
    expect(background.style.height).toBe("");
  });
});
