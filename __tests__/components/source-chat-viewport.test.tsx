import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SourceChatPage from "@/components/chat/source-chat-page";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/chat/chat-interface", () => ({ ChatInterface: () => <div role="region" aria-label="Chat with Alley">Composer</div> }));
vi.mock("@/components/chat/recent-conversations-panel", () => ({ RecentConversationsPanel: () => null }));
describe("interactive chat viewport", () => {
  it("bounds the actual chat page, with both navigation borders and the safe area included", () => {
    render(<SourceChatPage />);
    const background = screen.getByRole("region", { name: "Chat with Alley" }).closest(".page-premium") as HTMLElement;
    expect(background).not.toBeNull();
    expect(background.className).toContain("h-[calc(100dvh-7.5rem-2px-env(safe-area-inset-bottom,0px))]");
    expect(background.className).toContain("md:h-[calc(100dvh-4rem-1px)]");
    expect(background.style.height).toBe("");
  });
});
