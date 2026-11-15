import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

// The root layout's MainContentShell is the page's only <main>. A page that renders its own
// <main> nests a second landmark inside it (axe landmark-main-is-top-level,
// landmark-no-duplicate-main, landmark-unique), so screen-reader "jump to main" breaks.
describe("single main landmark", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
    );

  it("renders <main> only in MainContentShell", () => {
    const offenders = ["app", "components"]
      .flatMap((d) => walk(join(process.cwd(), d)))
      .filter((f) => !f.endsWith(join("layout", "main-content-shell.tsx")))
      .filter((f) => /<main[\s>]/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(process.cwd().length + 1));
    expect(offenders).toEqual([]);
  });
});
