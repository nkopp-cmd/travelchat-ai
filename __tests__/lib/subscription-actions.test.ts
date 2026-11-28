// Push ED1: the checkout click is the only path to Stripe. These tests pin its request body, its redirect
// and its error messages, so a refactor cannot break it silently.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackFunnelStep = vi.fn();
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: (...args: unknown[]) => trackFunnelStep(...args) }));

import {
  fetchSubscriptionStatus,
  readErrorMessage,
  requestBillingPortal,
  requestCheckout,
} from "@/lib/subscription-actions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let originalLocation: Location;

beforeEach(() => {
  trackFunnelStep.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  originalLocation = window.location;
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: { href: "https://www.localley.io/pricing" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
});

function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body));
}

describe("requestCheckout", () => {
  it("counts checkout_start once, posts the plan and opens the Stripe URL", async () => {
    fetchMock.mockResolvedValue(json({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    const data = await requestCheckout({ tier: "pro", billingCycle: "yearly", source: "pricing" });

    expect(trackFunnelStep).toHaveBeenCalledTimes(1);
    expect(trackFunnelStep).toHaveBeenCalledWith("checkout_start", "pricing");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subscription/checkout");
    expect(init.method).toBe("POST");
    expect(sentBody()).toEqual({ tier: "pro", billingCycle: "yearly", source: "pricing" });
    expect(window.location.href).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(data.url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
  });

  it("sends an allowed returnTo and drops a funnel source the server would reject", async () => {
    fetchMock.mockResolvedValue(json({ url: "https://checkout.stripe.com/x" }));
    await requestCheckout({ tier: "premium", billingCycle: "monthly", source: "spot" as never, returnTo: "planner" });
    expect(sentBody()).toEqual({ tier: "premium", billingCycle: "monthly", returnTo: "planner" });
    expect(trackFunnelStep).toHaveBeenCalledWith("checkout_start", "spot");
  });

  it("drops a returnTo that is not on the allowlist", async () => {
    fetchMock.mockResolvedValue(json({ url: "https://checkout.stripe.com/x" }));
    await requestCheckout({ tier: "pro", billingCycle: "monthly", source: "preview", returnTo: "https://evil.example" as never });
    expect(sentBody()).toEqual({ tier: "pro", billingCycle: "monthly", source: "preview" });
  });

  it("stays on the page when the server returns no URL", async () => {
    fetchMock.mockResolvedValue(json({}));
    await requestCheckout({ tier: "pro", billingCycle: "monthly", source: "pricing" });
    expect(window.location.href).toBe("https://www.localley.io/pricing");
  });

  it("throws the server message and does not redirect on an error", async () => {
    fetchMock.mockResolvedValue(json({ error: "You already have an active subscription" }, 409));
    await expect(requestCheckout({ tier: "pro", billingCycle: "monthly", source: "pricing" }))
      .rejects.toThrow("You already have an active subscription");
    expect(window.location.href).toBe("https://www.localley.io/pricing");
  });

  it("throws the fallback when the error is an HTML page", async () => {
    fetchMock.mockResolvedValue(new Response("<!DOCTYPE html><html>502</html>", { status: 502, headers: { "content-type": "text/html" } }));
    await expect(requestCheckout({ tier: "pro", billingCycle: "monthly", source: "pricing" }))
      .rejects.toThrow("Failed to create checkout session");
  });
});

describe("requestBillingPortal", () => {
  it("posts and opens the portal URL", async () => {
    fetchMock.mockResolvedValue(json({ url: "https://billing.stripe.com/p/session/1" }));
    await requestBillingPortal();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subscription/portal");
    expect(init.method).toBe("POST");
    expect(window.location.href).toBe("https://billing.stripe.com/p/session/1");
  });

  it("throws the nested error message", async () => {
    fetchMock.mockResolvedValue(json({ error: { message: "No billing account" } }, 400));
    await expect(requestBillingPortal()).rejects.toThrow("No billing account");
  });
});

describe("fetchSubscriptionStatus", () => {
  it("throws on a failed response", async () => {
    fetchMock.mockResolvedValue(json({}, 500));
    await expect(fetchSubscriptionStatus()).rejects.toThrow("Failed to fetch subscription");
  });

  it("returns the status body", async () => {
    fetchMock.mockResolvedValue(json({ tier: "pro", status: "trialing" }));
    await expect(fetchSubscriptionStatus()).resolves.toMatchObject({ tier: "pro", status: "trialing" });
  });
});

describe("readErrorMessage", () => {
  it.each([
    [{ error: { message: "nested" } }, "nested"],
    [{ error: "flat" }, "flat"],
    [{ message: "top" }, "top"],
  ])("reads %j", async (body, expected) => {
    await expect(readErrorMessage(json(body, 400), "fallback")).resolves.toBe(expected);
  });

  it("uses plain text, then the fallback for empty or HTML bodies", async () => {
    await expect(readErrorMessage(new Response("Rate limited", { status: 429 }), "fallback")).resolves.toBe("Rate limited");
    await expect(readErrorMessage(new Response("", { status: 500 }), "fallback")).resolves.toBe("fallback");
    await expect(readErrorMessage(new Response("<html>err</html>", { status: 500 }), "fallback")).resolves.toBe("fallback");
  });
});
