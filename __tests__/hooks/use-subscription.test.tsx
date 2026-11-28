import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
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

import { getCurrentUsage, useSubscription } from "@/hooks/use-subscription";
import type { SubscriptionStatus } from "@/lib/subscription-actions";

const usage = { itinerariesThisMonth: 0, chatMessagesToday: 0, storiesThisWeek: 0, aiImagesThisMonth: 0, savedSpots: 0 };

function status(over: Partial<SubscriptionStatus> = {}): SubscriptionStatus {
  return {
    tier: "free",
    status: "active",
    isActive: true,
    hasBillingPortal: false,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEnd: null,
    limits: { itinerariesPerMonth: 1, chatMessagesPerDay: 10, storiesPerWeek: 1, aiImagesPerMonth: 0, savedSpotsLimit: 10 },
    usage,
    ...over,
  };
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

beforeEach(() => {
  mocks.auth = { isLoaded: true, isSignedIn: false };
  mocks.status.mockReset();
  mocks.checkout.mockReset().mockResolvedValue(undefined);
  mocks.portal.mockReset().mockResolvedValue(undefined);
});

describe("useSubscription (push EF1)", () => {
  it("signed out: free tier, no status read, not loading, limits never block", () => {
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    expect(result.current).toMatchObject({ tier: "free", isPro: false, isPremium: false, isLoading: false, subscription: null });
    expect(result.current.isWithinLimit("itinerariesPerMonth")).toBe(true);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("loading while auth is unknown", () => {
    mocks.auth = { isLoaded: false, isSignedIn: false };
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("signed in Pro: isPro, not isPremium, portal flag, Pro features open", async () => {
    mocks.auth = { isLoaded: true, isSignedIn: true };
    mocks.status.mockResolvedValue(status({ tier: "pro", hasBillingPortal: true }));
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ tier: "pro", isPro: true, isPremium: false, isActive: true, hasBillingPortal: true });
    expect(result.current.canUseFeature("pdfExport")).toBe(true); // "clean"
    expect(result.current.canUseFeature("addressDisplay")).toBe(true); // "full"
    expect(result.current.canUseFeature("smartScheduling")).toBe(false); // Premium only
  });

  it("signed in Premium counts as Pro too", async () => {
    mocks.auth = { isLoaded: true, isSignedIn: true };
    mocks.status.mockResolvedValue(status({ tier: "premium" }));
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.tier).toBe("premium"));
    expect(result.current).toMatchObject({ isPro: true, isPremium: true });
    expect(result.current.canUseFeature("smartScheduling")).toBe(true);
  });

  it("free gates: degraded feature values read as closed, used-up limits block", async () => {
    mocks.auth = { isLoaded: true, isSignedIn: true };
    mocks.status.mockResolvedValue(status({ usage: { ...usage, itinerariesThisMonth: 1, savedSpots: 9 } }));
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.subscription).not.toBeNull());
    expect(result.current.canUseFeature("activityImages")).toBe(false); // "placeholder"
    expect(result.current.canUseFeature("addressDisplay")).toBe(false); // "area-only"
    expect(result.current.canUseFeature("pdfExport")).toBe(false); // "watermarked"
    expect(result.current.canUseFeature("smartScheduling")).toBe(false);
    expect(result.current.canUseFeature("bookingLinks")).toBe(true);
    expect(result.current.isWithinLimit("itinerariesPerMonth")).toBe(false); // 1 of 1 used
    expect(result.current.isWithinLimit("savedSpotsLimit")).toBe(true); // 9 of 10
  });

  it("a failed status read leaves the free tier and reports the error", async () => {
    mocks.auth = { isLoaded: true, isSignedIn: true };
    mocks.status.mockRejectedValue(new Error("status 500"));
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error?.message).toBe("status 500"), { timeout: 4000 });
    expect(result.current).toMatchObject({ tier: "free", isPro: false });
  });

  it("openCheckout defaults to monthly from pricing and forwards explicit args", async () => {
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    await act(() => result.current.openCheckout("pro"));
    expect(mocks.checkout).toHaveBeenLastCalledWith({ tier: "pro", billingCycle: "monthly", source: "pricing", returnTo: undefined });
    await act(() => result.current.openCheckout("premium", "yearly", "preview", "itinerary-preview"));
    expect(mocks.checkout).toHaveBeenLastCalledWith({ tier: "premium", billingCycle: "yearly", source: "preview", returnTo: "itinerary-preview" });
  });

  it("openCheckout surfaces a checkout failure to the caller", async () => {
    mocks.checkout.mockRejectedValue(new Error("checkout 502"));
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    await expect(act(() => result.current.openCheckout("pro"))).rejects.toThrow("checkout 502");
  });

  it("openBillingPortal calls the portal action", async () => {
    const { result } = renderHook(() => useSubscription(), { wrapper: wrapper() });
    await act(() => result.current.openBillingPortal());
    expect(mocks.portal).toHaveBeenCalledTimes(1);
  });
});

describe("getCurrentUsage", () => {
  it("maps every limit to its usage field", () => {
    const u = { itinerariesThisMonth: 1, chatMessagesToday: 2, storiesThisWeek: 3, aiImagesThisMonth: 4, savedSpots: 5 };
    expect(getCurrentUsage(u, "itinerariesPerMonth")).toBe(1);
    expect(getCurrentUsage(u, "chatMessagesPerDay")).toBe(2);
    expect(getCurrentUsage(u, "storiesPerWeek")).toBe(3);
    expect(getCurrentUsage(u, "aiImagesPerMonth")).toBe(4);
    expect(getCurrentUsage(u, "savedSpotsLimit")).toBe(5);
  });
});
