import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signedIn: false, tier: "free", openCheckout: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: mocks.signedIn }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-subscription", () => ({ useSubscription: () => ({
  tier: mocks.tier, isLoading: false, openCheckout: mocks.openCheckout, openBillingPortal: vi.fn(), hasBillingPortal: false,
}) }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => children }));
import PricingPage from "@/app/pricing/page";
import { checkoutSignUpUrl, parseCheckoutIntent, withoutCheckoutParam } from "@/lib/pricing-checkout";

const setUrl = (path: string) => window.history.replaceState(null, "", path);
beforeEach(() => { mocks.signedIn = false; mocks.tier = "free"; mocks.openCheckout.mockResolvedValue(undefined); setUrl("/pricing"); });
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
  it("sends a signed-out visitor to sign-up with the plan kept and no error toast", () => {
    render(<PricingPage />);
    const location = { href: "" };
    vi.stubGlobal("location", location);
    fireEvent.click(screen.getByRole("button", { name: "Subscribe to Pro" }));
    expect(location.href).toBe("/sign-up?redirect_url=%2Fpricing%3Fcheckout%3Dpro-monthly");
    expect(mocks.toast).not.toHaveBeenCalled();
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
  });
  it("does not start a second subscription for a paying member", async () => {
    mocks.signedIn = true; mocks.tier = "pro";
    setUrl("/pricing?checkout=pro-monthly");
    render(<PricingPage />);
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });
});
