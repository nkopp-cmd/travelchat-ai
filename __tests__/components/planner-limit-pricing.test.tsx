import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerCity } from "@/lib/cities-catalog";

// Money path (push AP1, 2026-11-19): a free account past its monthly trip must reach /pricing with the reason.
// Before: the wizard waited for `result.upgrade`, which Errors.limitExceeded never sends -> toast-only dead end.
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn(), funnelSource: () => "direct", clientNavLanding: () => "" }));
import { ItineraryWizard, getQuickStartLabel } from "@/components/itineraries/wizard";
import { Errors } from "@/lib/api-errors";
import { formatResetDay, parsePlannerLimit, plannerLimitPricingHref } from "@/lib/pricing-checkout";

const cities = [
  { slug: "tokyo", name: "Tokyo", emoji: "*", vibe: "Tokyo vibe", spotCount: 429, status: "recommended" },
] as unknown as PlannerCity[];

describe("planner limit -> pricing (push AP1)", () => {
  beforeEach(() => { localStorage.clear(); nav.push.mockReset(); Element.prototype.scrollTo = () => {}; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("routes the server's real limit_exceeded answer to /pricing with the reset day", async () => {
    const limited = Errors.limitExceeded("itineraries", 1, 1, "2026-12-01T00:00:00.000Z");
    expect(limited.status).toBe(429);
    const body = await limited.json();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status: 429 })));
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) })); });
    await waitFor(() => expect(nav.push.mock.calls).toEqual([["/pricing/upgrade?limit=itineraries&resets=2026-12-01"]]));
  });

  it("builds and reads the pricing link; bad reset values are dropped, never shown", () => {
    expect(plannerLimitPricingHref(undefined)).toBe("/pricing/upgrade?limit=itineraries");
    expect(plannerLimitPricingHref("soon")).toBe("/pricing/upgrade?limit=itineraries");
    expect(plannerLimitPricingHref("2026-13-45T00:00:00Z")).toBe("/pricing/upgrade?limit=itineraries");
    expect(parsePlannerLimit("?limit=itineraries&resets=2026-12-01")).toEqual({ resets: "2026-12-01" });
    expect(parsePlannerLimit("?limit=itineraries&resets=<script>")).toEqual({ resets: null });
    expect(parsePlannerLimit("?limit=other")).toBeNull();
    expect(parsePlannerLimit("")).toBeNull();
    expect(formatResetDay("2026-12-01")).toBe("December 1");
  });
});
