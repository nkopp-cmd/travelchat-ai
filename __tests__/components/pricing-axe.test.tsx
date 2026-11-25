import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";

// Push DI3: the live axe walk (scripts/a11y-money-pages.mjs) sees /pricing only signed out with no query. A payer also
// lands here signed in, as a member, from the planner limit and back from a closed checkout. Axe runs on each state.
// jsdom has no layout, so colour contrast stays with the live walk and the design-token checks.
const mocks = vi.hoisted(() => ({ signedIn: false, tier: "free", portal: false }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: mocks.signedIn }), useUser: () => ({ isLoaded: true, isSignedIn: mocks.signedIn }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/use-pricing-subscription", () => ({ usePricingSubscription: () => ({
  tier: mocks.tier, isLoading: false, openCheckout: vi.fn(), openBillingPortal: vi.fn(), hasBillingPortal: mocks.portal,
}) }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/providers/subscription-provider", () => ({ useSubscriptionContext: () => ({ openCheckout: vi.fn(), tier: mocks.tier }) }));
import PricingPage from "@/app/pricing/page";

async function blockingViolations(container: HTMLElement) {
  const result = await axe.run(container, {
    runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

beforeEach(() => { mocks.signedIn = false; mocks.tier = "free"; mocks.portal = false; window.history.replaceState(null, "", "/pricing"); });
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("pricing accessibility (Push DI3)", () => {
  it.each([
    ["signed out", false, "free", false, "/pricing"],
    ["signed-in free account", true, "free", false, "/pricing"],
    ["Pro member with billing portal", true, "pro", true, "/pricing"],
    ["Premium with included access", true, "premium", false, "/pricing"],
    ["from the planner limit", true, "free", false, "/pricing?limit=itineraries&resets=2026-12-01"],
    ["back from a closed checkout", true, "free", false, "/pricing?canceled=true"],
  ])("%s: no serious or critical violation", async (_name, signedIn, tier, portal, url) => {
    mocks.signedIn = signedIn; mocks.tier = tier; mocks.portal = portal;
    window.history.replaceState(null, "", url);
    const { container } = render(<PricingPage />);
    await screen.findAllByRole("heading", { level: 1 });
    if (url.includes("limit=")) await screen.findByTestId("pricing-planner-limit");
    if (url.includes("canceled=")) await screen.findByTestId("pricing-checkout-closed");
    expect(await blockingViolations(container)).toEqual([]);
  });

  it("the yearly switch keeps its name and state, and the cards stay accessible after the switch", async () => {
    const { container } = render(<PricingPage />);
    const toggle = await screen.findByRole("switch", { name: "Toggle yearly billing" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Monthly" }).getAttribute("aria-pressed")).toBe("false");
    expect(await blockingViolations(container)).toEqual([]);
  });

  it("every button on the page has a visible or accessible name", async () => {
    mocks.signedIn = true;
    render(<PricingPage />);
    await screen.findAllByRole("heading", { level: 1 });
    for (const button of screen.getAllByRole("button")) {
      expect((button.textContent ?? "").trim() || button.getAttribute("aria-label")).toBeTruthy();
    }
  });
});
