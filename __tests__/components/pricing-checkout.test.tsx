import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signedIn: false, authLoaded: true, subLoading: false, tier: "free", openCheckout: vi.fn(), toast: vi.fn(), track: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: mocks.track }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ isLoaded: mocks.authLoaded, isSignedIn: mocks.signedIn }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-subscription", () => ({ useSubscription: () => ({
  tier: mocks.tier, isLoading: mocks.subLoading, openCheckout: mocks.openCheckout, openBillingPortal: vi.fn(), hasBillingPortal: false,
}) }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/providers/subscription-provider", () => ({ useSubscriptionContext: () => ({ openCheckout: mocks.openCheckout, tier: mocks.tier }) }));
import PricingPage from "@/app/pricing/page";
import { LimitExceededModal } from "@/components/subscription/limit-exceeded-modal";
import { checkoutSignUpUrl, parseCheckoutIntent, withoutCheckoutParam } from "@/lib/pricing-checkout";

const setUrl = (path: string) => window.history.replaceState(null, "", path);
beforeEach(() => { mocks.signedIn = false; mocks.authLoaded = true; mocks.subLoading = false; mocks.tier = "free"; mocks.openCheckout.mockResolvedValue(undefined); setUrl("/pricing"); });
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("pricing checkout intent", () => {
  it("round-trips every tier and cycle through the sign-up redirect", () => {
    fc.assert(fc.property(fc.constantFrom("pro", "premium"), fc.constantFrom("monthly", "yearly"), (tier, cycle) => {
      const url = new URL(checkoutSignUpUrl(tier as "pro", cycle as "monthly"), "https://www.localley.io");
      expect(url.pathname).toBe("/sign-up");
      const back = new URL(url.searchParams.get("redirect_url")!, "https://www.localley.io");
      expect(back.pathname).toBe("/pricing");
      expect(parseCheckoutIntent(back.search)).toEqual({ tier, cycle });
    }));
    expect(checkoutSignUpUrl("pro", "monthly")).toBe("/sign-up?redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly");
  });
  it("never reads a tier that is not a paid plan", () => {
    fc.assert(fc.property(fc.string(), (value) => {
      const intent = parseCheckoutIntent(`?checkout=${encodeURIComponent(value)}`);
      if (intent) expect(["pro-monthly", "pro-yearly", "premium-monthly", "premium-yearly"]).toContain(value);
    }));
    expect(withoutCheckoutParam("https://x.io/pricing?checkout=pro-monthly&a=1#f")).toBe("/pricing?a=1#f");
  });
});

describe("/pricing subscribe flow", () => {
  // Push BU1: signed out (or the session check still running) the paid buttons are real links, never disabled.
  it.each([[true], [false]])("signed out (session loaded %s): each plan is a sign-up link with the plan and cycle kept", (loaded) => {
    mocks.authLoaded = loaded; mocks.subLoading = !loaded;
    render(<PricingPage />);
    for (const [tier, name] of [["pro", "Pro"], ["premium", "Premium"]] as const) {
      const link = screen.getByRole("link", { name: `Subscribe to ${name}` });
      expect(link.getAttribute("href")).toBe(checkoutSignUpUrl(tier, "monthly"));
      expect(link.hasAttribute("disabled")).toBe(false);
    }
    expect(screen.queryByRole("button", { name: /Subscribe to/ })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Toggle yearly billing" }));
    expect(screen.getByRole("link", { name: "Subscribe to Premium" }).getAttribute("href")).toBe(checkoutSignUpUrl("premium", "yearly"));
    expect(mocks.openCheckout).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled(); // counted once on the resume after sign-up, not twice
  });
  it("signed in: the plan is a button that opens Stripe checkout", async () => {
    mocks.signedIn = true;
    render(<PricingPage />);
    expect(screen.queryByRole("link", { name: /Subscribe to/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Subscribe to Pro" }));
    await waitFor(() => expect(mocks.openCheckout).toHaveBeenCalledWith("pro", "monthly"));
    expect(mocks.track.mock.calls).toEqual([["checkout_start", "pricing"]]); // Push BW1
  });
  it("starts Stripe once after sign-up and removes the parameter", async () => {
    mocks.signedIn = true;
    setUrl("/pricing?checkout=premium-yearly");
    const { rerender } = render(<PricingPage />);
    rerender(<PricingPage />);
    await waitFor(() => expect(mocks.openCheckout).toHaveBeenCalledTimes(1));
    expect(mocks.openCheckout).toHaveBeenCalledWith("premium", "yearly");
    expect(window.location.search).toBe("");
    rerender(<PricingPage />);
    expect(mocks.openCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.track.mock.calls).toEqual([["checkout_start", "pricing"]]); // Push BW1: once, like Stripe
  });
  it("does not start a second subscription for a paying member", async () => {
    mocks.signedIn = true; mocks.tier = "pro";
    setUrl("/pricing?checkout=pro-monthly");
    render(<PricingPage />);
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(mocks.openCheckout).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled(); // Push BW1: no checkout start without a checkout
  });
});

describe("/pricing after a closed Stripe checkout", () => {
  it("says nothing was charged, keeps the free plan link and drops the parameter", async () => {
    mocks.signedIn = true;
    setUrl("/pricing?canceled=true#plans");
    render(<PricingPage />);
    const note = await screen.findByTestId("pricing-checkout-closed");
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toContain("You were not charged.");
    expect(note.querySelector("a")?.getAttribute("href")).toBe("/itineraries/new");
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/pricing#plans");
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });
  it.each(["/pricing", "/pricing?canceled=false", "/pricing?checkout=pro-monthly"])("shows no note on %s", (path) => {
    setUrl(path);
    render(<PricingPage />);
    expect(screen.queryByTestId("pricing-checkout-closed")).toBeNull();
  });
});

describe("/pricing positioning (Push AY1)", () => {
  it("sells the local-friend promise and shows no internal billing wording", () => {
    const { container } = render(<PricingPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your local friend is free. Pro plans the whole trip.");
    expect(screen.getByText("Spots locals rate")).toBeTruthy();
    expect(screen.getByText("Addresses a driver can read")).toBeTruthy();
    const text = container.textContent ?? "";
    for (const internal of ["auditable", "payment state", "trip intent", "Richer outputs", "highest-capability"]) {
      expect(text).not.toContain(internal);
    }
  });
});

describe("/pricing billing cycle words (Push BU3)", () => {
  it("Monthly and Yearly each set their own cycle, tapping the active one keeps it", () => {
    render(<PricingPage />);
    const toggle = screen.getByRole("switch", { name: "Toggle yearly billing" });
    const yearly = screen.getByRole("button", { name: "Yearly" });
    const monthly = screen.getByRole("button", { name: "Monthly" });
    fireEvent.click(yearly);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(yearly);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(yearly.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(monthly);
    fireEvent.click(monthly);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(monthly.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("limit modal checkout start (Push BW1)", () => {
  it("counts checkout_start with source other before Stripe opens", async () => {
    render(<LimitExceededModal open onOpenChange={() => {}} limitType="itineraries" currentUsage={1} limit={1} resetAt="2026-12-01T00:00:00Z" />);
    fireEvent.click(screen.getAllByRole("button", { name: /Upgrade to pro/i }).at(-1)!);
    await waitFor(() => expect(mocks.openCheckout).toHaveBeenCalledWith("pro"));
    expect(mocks.track.mock.calls).toEqual([["checkout_start", "other"]]);
  });
});
