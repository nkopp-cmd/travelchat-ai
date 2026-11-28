import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false },
  status: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ useUser: () => mocks.auth }));
vi.mock("@/lib/subscription-actions", () => ({
  fetchSubscriptionStatus: mocks.status,
  requestCheckout: mocks.checkout,
  requestBillingPortal: mocks.portal,
}));

import { usePricingSubscription } from "@/hooks/use-pricing-subscription";

beforeEach(() => {
  mocks.auth = { isLoaded: true, isSignedIn: false };
  mocks.status.mockReset();
  mocks.checkout.mockReset().mockResolvedValue(undefined);
  mocks.portal.mockReset().mockResolvedValue(undefined);
});

describe("usePricingSubscription (push EE3)", () => {
  it("signed out: free plan, no status read, not loading", () => {
    const { result } = renderHook(() => usePricingSubscription());
    expect(result.current).toMatchObject({ tier: "free", isLoading: false, hasBillingPortal: false });
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("loading while auth is unknown", () => {
    mocks.auth = { isLoaded: false, isSignedIn: false };
    const { result } = renderHook(() => usePricingSubscription());
    expect(result.current.isLoading).toBe(true);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("signed in: loading until the status read settles, then the paid tier and portal flag", async () => {
    mocks.auth = { isLoaded: true, isSignedIn: true };
    let resolve!: (v: unknown) => void;
    mocks.status.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => usePricingSubscription());
    expect(result.current).toMatchObject({ tier: "free", isLoading: true });
    await act(async () => { resolve({ tier: "pro", hasBillingPortal: true }); });
    expect(result.current).toMatchObject({ tier: "pro", isLoading: false, hasBillingPortal: true });
    expect(mocks.status).toHaveBeenCalledTimes(1);
  });

  it("signed in: a failed status read ends loading and treats the plan as free", async () => {
    mocks.auth = { isLoaded: true, isSignedIn: true };
    mocks.status.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => usePricingSubscription());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ tier: "free", hasBillingPortal: false });
  });

  it("openCheckout forwards tier, cycle, source and returnTo; defaults are monthly from pricing", async () => {
    const { result } = renderHook(() => usePricingSubscription());
    await act(() => result.current.openCheckout("premium", "yearly", "preview", "planner"));
    await act(() => result.current.openCheckout("pro"));
    expect(mocks.checkout.mock.calls).toEqual([
      [{ tier: "premium", billingCycle: "yearly", source: "preview", returnTo: "planner" }],
      [{ tier: "pro", billingCycle: "monthly", source: "pricing", returnTo: undefined }],
    ]);
  });

  it("openCheckout passes a checkout error to the caller (the page shows the toast)", async () => {
    mocks.checkout.mockRejectedValue(new Error("Failed to create checkout session"));
    const { result } = renderHook(() => usePricingSubscription());
    await expect(result.current.openCheckout("pro")).rejects.toThrow("Failed to create checkout session");
  });

  it("openBillingPortal calls the portal request once", async () => {
    const { result } = renderHook(() => usePricingSubscription());
    await act(() => result.current.openBillingPortal());
    expect(mocks.portal).toHaveBeenCalledTimes(1);
  });
});
