import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/components/ui/city-image", () => ({ CityImageAvatar: () => null }));

import { OnboardingPanel } from "@/components/dashboard/onboarding-panel";

// Push DD4: the new-account onboarding panel sits behind sign-in, so the live axe walk
// (scripts/a11y-money-pages.mjs) never reaches it. Axe runs here on the rendered panel instead.
// jsdom has no layout, so colour contrast stays with the live walk and the design-token checks.
async function blockingViolations(container: HTMLElement) {
  const result = await axe.run(container, {
    runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

describe("onboarding panel accessibility (Push DD4)", () => {
  it("has no serious or critical axe violation", async () => {
    const { container } = render(<main><OnboardingPanel /></main>);
    expect(await blockingViolations(container)).toEqual([]);
  });

  it("every planner link has a name that says where it goes", () => {
    const { container } = render(<OnboardingPanel />);
    const links = [...container.querySelectorAll("a")];
    expect(links.length).toBeGreaterThan(1);
    for (const link of links) expect((link.textContent ?? "").trim() || link.getAttribute("aria-label")).toBeTruthy();
  });
});
