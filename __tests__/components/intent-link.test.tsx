import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch }) }));
import { IntentLink } from "@/components/navigation/intent-link";

describe("IntentLink", () => {
  it("prefetches once on intent and keeps caller handlers", () => {
    const onFocus = vi.fn();
    render(<IntentLink href="/chat" onFocus={onFocus}>Chat</IntentLink>);
    const link = screen.getByRole("link", { name: "Chat" });
    expect(link.getAttribute("href")).toBe("/chat");
    expect(prefetch).not.toHaveBeenCalled();
    fireEvent.pointerEnter(link);
    fireEvent.focus(link);
    fireEvent.touchStart(link);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/chat");
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it("is used by every shared chrome link instead of viewport prefetch", () => {
    for (const file of ["components/layout/navbar.tsx", "components/layout/navbar-drawer.tsx", "components/layout/mobile-bottom-nav.tsx", "components/brand/logo.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("<IntentLink");
      expect(source).not.toMatch(/<Link key=\{(route|item)\.href\}/);
    }
    expect(readFileSync("components/navigation/intent-link.tsx", "utf8")).toMatch(/prefetch=\{false\}/);
  });
});
