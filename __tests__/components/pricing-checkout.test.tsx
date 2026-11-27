import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signedIn: false, authLoaded: true, subLoading: false, tier: "free", openCheckout: vi.fn(), toast: vi.fn(), track: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: mocks.track }));
vi.mock("@/lib/auth/client", () => ({ useAuth: () => ({ isLoaded: mocks.authLoaded, isSignedIn: mocks.signedIn }), useUser: () => ({ isLoaded: mocks.authLoaded, isSignedIn: mocks.signedIn }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-pricing-subscription", () => ({ usePricingSubscription: () => ({
  tier: mocks.tier, isLoading: mocks.subLoading, openCheckout: mocks.openCheckout, openBillingPortal: vi.fn(), hasBillingPortal: false,
}) }));
vi.mock("@/components/layout/app-background", () => ({ AppBackground: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/providers/subscription-provider", () => ({ useSubscriptionContext: () => ({ openCheckout: mocks.openCheckout, tier: mocks.tier }) }));
import PricingPage from "@/app/pricing/page";
import PlannerUpgradePage from "@/app/pricing/upgrade/page";
import { LimitExceededModal } from "@/components/subscription/limit-exceeded-modal";
import { checkoutSignUpUrl, parseCheckoutIntent, parsePlannerLimit, withoutCheckoutParam } from "@/lib/pricing-checkout";

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
  it("puts both planner upgrade links in the initial HTML, before React runs", async () => {
    mocks.authLoaded = false;
    mocks.subLoading = true;
    const markup = renderToStaticMarkup(await PlannerUpgradePage({ searchParams: Promise.resolve({ limit: "itineraries", resets: "2026-12-01" }) }));
    const doc = new DOMParser().parseFromString(markup, "text/html");
    expect(doc.querySelector('[data-testid="pricing-planner-limit"]')?.textContent).toContain("December 1");
    for (const tier of ["pro", "premium"] as const) {
      const link = doc.querySelector<HTMLAnchorElement>(`a[data-testid="pricing-subscribe-${tier}"]`);
      const signUp = new URL(link!.getAttribute("href")!, "https://www.localley.io");
      const resume = new URL(signUp.searchParams.get("redirect_url")!, signUp.origin);
      expect(signUp.pathname).toBe("/sign-up");
      expect(resume.pathname).toBe("/pricing/upgrade");
      expect(parseCheckoutIntent(resume.search)).toEqual({ tier, cycle: "monthly" });
      expect(parsePlannerLimit(resume.search)).toEqual({ resets: "2026-12-01" });
    }
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });
  it("shows the yearly monthly equivalent and the actual annual charge on each plan", () => {
    render(<PricingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
    for (const [tier, monthly, annual] of [["Pro", "$6.59", "$79"], ["Premium", "$13.25", "$159"]]) {
      const card = screen.getByRole("heading", { name: tier, exact: true }).closest("article");
      expect(card?.textContent).toContain(`${monthly}/month`);
      expect(card?.textContent).toContain(`Billed ${annual} per year`);
      // Pro carries the 7-day trial; Premium has none.
      expect(card?.textContent?.includes("7 days free")).toBe(tier === "Pro");
    }
    fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
    expect(screen.getByText("$9")).toBeTruthy();
    expect(screen.getByText("$19")).toBeTruthy();
    expect(screen.queryByText(/Billed .* per year/)).toBeNull();
  });

  // Push BU1: signed out (or the session check still running) the paid buttons are real links, never disabled.
  it.each([[true], [false]])("signed out (session loaded %s): each plan is a sign-up link with the plan and cycle kept", (loaded) => {
    mocks.authLoaded = loaded; mocks.subLoading = !loaded;
    render(<PricingPage />);
    for (const [tier, name] of [["pro", "Pro"], ["premium", "Premium"]] as const) {
      const link = screen.getByRole("link", { name: tier === "pro" ? "Try Pro 7 days free" : `Subscribe to ${name}` });
      expect(link.getAttribute("href")).toBe(checkoutSignUpUrl(tier, "monthly"));
      expect(link.hasAttribute("disabled")).toBe(false);
    }
    expect(screen.queryByRole("button", { name: /Subscribe to|days free/ })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Toggle yearly billing" }));
    expect(screen.getByRole("link", { name: "Subscribe to Premium" }).getAttribute("href")).toBe(checkoutSignUpUrl("premium", "yearly"));
    expect(mocks.openCheckout).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled(); // counted once on the resume after sign-up, not twice
  });
  it("signed in: the plan is a button that opens Stripe checkout", async () => {
    mocks.signedIn = true;
    render(<PricingPage />);
    expect(screen.queryByRole("link", { name: /Subscribe to|days free/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try Pro 7 days free" }));
    await waitFor(() => expect(mocks.openCheckout).toHaveBeenCalledWith("pro", "monthly"));
    expect(mocks.track).not.toHaveBeenCalled(); // the hook counts checkout_start (source pricing by default), never the page too
  });
  it("opened from the planner limit: the checkout returns to the planner (Push BY1)", async () => {
    mocks.signedIn = true;
    setUrl("/pricing?limit=itineraries&resets=2026-12-01#plans");
    render(<PricingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Try Pro 7 days free" }));
    await waitFor(() => expect(mocks.openCheckout).toHaveBeenCalledWith("pro", "monthly", "pricing", "planner"));
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
    expect(mocks.track).not.toHaveBeenCalled(); // counted inside openCheckout only
  });
  it("resumes a planner checkout once after auth and keeps the limit and reset day", async () => {
    const href = checkoutSignUpUrl("premium", "yearly", { resets: "2026-12-01" });
    setUrl(new URL(href, window.location.origin).searchParams.get("redirect_url")!);
    const { rerender } = render(<PricingPage />);
    expect(mocks.openCheckout).not.toHaveBeenCalled();
    mocks.signedIn = true;
    rerender(<PricingPage />);
    await waitFor(() => expect(mocks.openCheckout).toHaveBeenCalledExactlyOnceWith("premium", "yearly", "pricing", "planner"));
    expect(window.location.search).toBe("?limit=itineraries&resets=2026-12-01");
    rerender(<PricingPage />);
    expect(mocks.openCheckout).toHaveBeenCalledTimes(1);
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
    await waitFor(() => expect(mocks.openCheckout).toHaveBeenCalledWith("pro", "monthly", "other"));
    expect(mocks.track).not.toHaveBeenCalled(); // counted inside openCheckout only
  });
});

describe("openCheckout counts each Stripe checkout once (Push BW1 fix)", () => {
  async function run(...args: [("pro" | "premium"), ("monthly" | "yearly")?, ("pricing" | "other")?, "planner"?]) {
    mocks.signedIn = true;
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("checkout") ? {} : { tier: "free" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { useSubscription } = await vi.importActual<typeof import("@/hooks/use-subscription")>("@/hooks/use-subscription");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useSubscription(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await result.current.openCheckout(...args);
    const calls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/subscription/checkout")) as unknown as [string, RequestInit][];
    return { count: calls.length, body: calls.length ? JSON.parse(String(calls[0][1].body)) : null };
  }
  it("default source is pricing, one event per checkout request, source in the body (Push BX2)", async () => {
    const { count, body } = await run("pro", "monthly");
    expect(count).toBe(1);
    expect(body).toEqual({ tier: "pro", billingCycle: "monthly", source: "pricing" });
    expect(mocks.track.mock.calls).toEqual([["checkout_start", "pricing"]]);
  });
  it("the limit modal source is kept in the event and the body", async () => {
    const { count, body } = await run("premium", "monthly", "other");
    expect(count).toBe(1);
    expect(body).toEqual({ tier: "premium", billingCycle: "monthly", source: "other" });
    expect(mocks.track.mock.calls).toEqual([["checkout_start", "other"]]);
  });
  it("sends returnTo planner only when asked (Push BY1)", async () => {
    expect((await run("pro", "monthly", "pricing", "planner")).body).toEqual({ tier: "pro", billingCycle: "monthly", source: "pricing", returnTo: "planner" });
    expect((await run("pro", "monthly")).body).not.toHaveProperty("returnTo");
  });
  it("a funnel source the server does not accept is left out of the body (no 400)", async () => {
    const { body } = await run("pro", "yearly", "home" as "other");
    expect(body).toEqual({ tier: "pro", billingCycle: "yearly" });
    expect(mocks.track.mock.calls).toEqual([["checkout_start", "home"]]);
  });
});

// Push CH2: /pricing uses the light hook (no React Query). Same beacon, same body, same Stripe redirect.
describe("usePricingSubscription matches useSubscription (Push CH2)", () => {
  it("reads the plan once and opens checkout with one checkout_start and the same body", async () => {
    mocks.signedIn = true;
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("checkout") ? {} : { tier: "pro", hasBillingPortal: true }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { usePricingSubscription } = await vi.importActual<typeof import("@/hooks/use-pricing-subscription")>("@/hooks/use-pricing-subscription");
    const { result } = renderHook(() => usePricingSubscription());
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tier).toBe("pro");
    expect(result.current.hasBillingPortal).toBe(true);
    await result.current.openCheckout("premium", "yearly", "pricing", "planner");
    const calls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/subscription/checkout")) as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ tier: "premium", billingCycle: "yearly", source: "pricing", returnTo: "planner" });
    expect(mocks.track.mock.calls).toEqual([["checkout_start", "pricing"]]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/subscription/status"))).toHaveLength(1);
  });
  it("signed out: no status request and not loading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { usePricingSubscription } = await vi.importActual<typeof import("@/hooks/use-pricing-subscription")>("@/hooks/use-pricing-subscription");
    const { result } = renderHook(() => usePricingSubscription());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.tier).toBe("free");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
