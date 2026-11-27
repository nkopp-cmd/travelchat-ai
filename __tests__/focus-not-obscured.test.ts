import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.4.11 (focus not obscured): keyboard focus must stay clear of the sticky header and
// the fixed mobile bottom bars (home signup bar, app bottom nav).
describe("focus not obscured", () => {
  it("pads scroll-into-view for the sticky header and the mobile bottom bars", async () => {
    const css = await readFile(resolve("app/globals.css"), "utf8");
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-top:\s*4\.5rem/);
    expect(css).toMatch(
      /@media \(max-width: 767\.98px\)\s*\{\s*html:has\(nav\[data-app-chrome\], \.mobile-sticky-safe-space\)\s*\{\s*scroll-padding-bottom:/,
    );
  });

  it("brings the hidden header back while focus is inside it", async () => {
    const navbar = await readFile(resolve("components/layout/navbar.tsx"), "utf8");
    expect(navbar).toContain("-translate-y-full focus-within:translate-y-0");
  });

  it("keeps the bottom bars tagged so the CSS can find them", async () => {
    const [nav, home] = await Promise.all([
      readFile(resolve("components/layout/mobile-bottom-nav.tsx"), "utf8"),
      readFile(resolve("app/page.tsx"), "utf8"),
    ]);
    expect(nav).toMatch(/<nav data-app-chrome[^>]*fixed inset-x-0 bottom-0/);
    expect(home).toContain("mobile-sticky-safe-space");
  });
});
