import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainContentShell } from "@/components/layout/main-content-shell";

const state = vi.hoisted(() => ({ pathname: "/pricing" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
afterEach(cleanup);

describe("mobile page scrolling", () => {
  it.each(["/pricing", "/spots", "/dashboard", "/itineraries", "/settings", "/profile", "/guide/apply"])("lets %s grow with the document and clears the fixed navigation", (pathname) => {
    state.pathname = pathname;
    render(<MainContentShell><button>Last action</button></MainContentShell>);
    const main = screen.getByRole("main");
    expect(main.className).not.toMatch(/overflow-|h-\[/);
    expect(main.className).toContain("pb-[var(--ll-nav-clearance)]");
    expect(main.hasAttribute("data-main-scroll-host")).toBe(false);
  });
  it.each(["/", "/sign-in", "/sign-up", "/itineraries/new"])("does not reserve space for absent navigation on %s", (pathname) => {
    state.pathname = pathname;
    render(<MainContentShell>Content</MainContentShell>);
    expect(screen.getByRole("main").className).not.toContain("pb-[");
  });
  it("leaves chat page variants free to select their own scroll model", () => {
    state.pathname = "/chat";
    render(<MainContentShell>Chat</MainContentShell>);
    const main = screen.getByRole("main");
    expect(main.className).not.toMatch(/overflow-|h-\[/);
    expect(main.className).toContain("pb-[var(--ll-nav-clearance)]");
  });
});
