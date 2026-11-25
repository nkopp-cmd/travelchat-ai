import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerCity } from "@/lib/cities-catalog";

// Money path (push AP3, 2026-11-19): every non-ok answer POST /api/itineraries/generate can send must give the
// visitor a next step: sign-up, pricing, or a retry toast with readable text and a "Try again" action.
// AP1 found a dead end (limit_exceeded -> toast only); this table keeps any other code from becoming one.
const nav = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn(), funnelSource: () => "direct", clientNavLanding: () => "" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: nav.toast, dismiss: vi.fn(), toasts: [] }), toast: nav.toast }));
import { GENERATE_FAILED_MESSAGE, ItineraryWizard, PICK_CITY_LABEL, getQuickStartLabel, parsePlanSuggestion, planSuggestionLabel } from "@/components/itineraries/wizard";
import { Errors, apiError, ErrorCodes } from "@/lib/api-errors";
import { GENERATED_PREVIEW_PATH, storeGeneratedPreview } from "@/lib/trips/generated-preview";

const cities = [
  { slug: "tokyo", name: "Tokyo", emoji: "*", vibe: "Tokyo vibe", spotCount: 429, status: "recommended" },
] as unknown as PlannerCity[];

type Answer = () => Promise<Response>;
const json = (res: Response | NextResponse): Answer => async () => new Response(await res.clone().text(), { status: res.status });

// The bodies are built with the same helpers the route uses, so a server shape change breaks this test.
const ROUTES: Array<[string, Answer, { to: RegExp } | { retry: RegExp }]> = [
  ["401 unauthorized (anon free trip used)", json(apiError(ErrorCodes.UNAUTHORIZED, "Create an account and choose a plan to keep building itineraries.", { signupUrl: "/sign-up" })), { to: /^\/sign-up\?redirect_url=/ }],
  ["429 limit_exceeded (free monthly trip used)", json(Errors.limitExceeded("itineraries", 1, 1, "2026-12-01T00:00:00.000Z")), { to: /^\/pricing\?limit=itineraries&resets=2026-12-01$/ }],
  ["400 validation_error", json(Errors.validationError("days: Expected number")), { retry: /days/ }],
  ["422 insufficient_verified_spots (post-model, no pickCity)", json(NextResponse.json({ error: "insufficient_verified_spots", message: "Localley could not build a full Tokyo plan from its verified spots for this mix. Try fewer days, a slower pace, or broader interests." }, { status: 422 })), { retry: /Try fewer days/ }],
  ["422 insufficient_verified_spots (no mix works: pickCity)", json(NextResponse.json({ error: "insufficient_verified_spots", message: "Localley cannot plan Tokyo yet. Pick another city to get your free plan now.", pickCity: true }, { status: 422 })), { retry: /Pick another city/ }],
  ["429 rate limiter (lib/rate-limit body)", json(NextResponse.json({ error: "Too many requests", message: "Rate limit exceeded. Please try again later.", retryAfter: 30 }, { status: 429 })), { retry: /try again later/i }],
  ["429 rate_limited (api-errors body)", json(Errors.rateLimited(30)), { retry: /try again later/i }],
  ["500 internal_error", json(Errors.internalError()), { retry: /try again/i }],
  ["502 HTML from the edge", async () => new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }), { retry: new RegExp(GENERATE_FAILED_MESSAGE.replace(/[.]/g, "\\.")) }],
  ["network failure (fetch rejects)", async () => { throw new TypeError("Failed to fetch"); }, { retry: new RegExp(GENERATE_FAILED_MESSAGE.replace(/[.]/g, "\\.")) }],
];

describe("planner: every generate failure has a next step (push AP3)", () => {
  beforeEach(() => { localStorage.clear(); nav.push.mockReset(); nav.toast.mockReset(); Element.prototype.scrollTo = () => {}; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("401 with a kept free plan opens that preview instead of the sign-up wall (push BL3)", async () => {
    storeGeneratedPreview(localStorage, { title: "Tokyo day", city: "Tokyo", days: 1, dailyPlans: [{ day: 1, activities: [] }] });
    vi.stubGlobal("fetch", vi.fn(ROUTES[0][1]));
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) })); });
    await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
    expect(nav.push.mock.calls[0][0]).toBe(GENERATED_PREVIEW_PATH);
    expect(nav.toast.mock.calls.at(-1)![0].description).toMatch(/Tokyo plan/);
  });

  it.each(ROUTES)("%s", async (_name, answer, expected) => {
    vi.stubGlobal("fetch", vi.fn(answer));
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    const generate = screen.getByRole("button", { name: getQuickStartLabel(3) });
    await act(async () => { fireEvent.click(generate); });

    if ("to" in expected) {
      await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
      expect(nav.push.mock.calls[0][0]).toMatch(expected.to);
      return;
    }
    await waitFor(() => expect(nav.toast).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalled();
    const shown = nav.toast.mock.calls.at(-1)![0] as { title: string; description: string; variant?: string; action?: unknown };
    expect(shown.variant).toBe("destructive");
    expect(shown.description).toMatch(expected.retry);
    expect(shown.description).not.toMatch(/\[object|undefined|<html/i);
    expect(shown.action).toBeTruthy();
    // The button is usable again, so "Try again" or a changed choice can re-send.
    await waitFor(() => expect((screen.getByRole("button", { name: getQuickStartLabel(3) }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("422 with a suggestion offers one tap that re-sends the checked mix (push CG3)", async () => {
    const answers = [
      json(NextResponse.json({
        error: "insufficient_verified_spots",
        message: "Localley cannot fill this exact Tokyo mix yet. A 2-day plan works now.",
        suggestion: { days: 2, pace: "moderate", interests: [] },
      }, { status: 422 })),
      json(NextResponse.json({ error: "internal_error", message: "Second answer" }, { status: 500 })),
    ];
    const fetchMock = vi.fn(() => answers[fetchMock.mock.calls.length - 1]());
    vi.stubGlobal("fetch", fetchMock);
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) })); });
    await waitFor(() => expect(nav.toast).toHaveBeenCalled());
    const shown = nav.toast.mock.calls.at(-1)![0] as { description: string; action: { props: { onClick: () => void; children: string } } };
    expect(shown.description).toMatch(/2-day plan works now/);
    expect(shown.action.props.children).toBe(planSuggestionLabel({ days: 2, pace: "moderate", interests: [] }));
    await act(async () => { shown.action.props.onClick(); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const sent = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toMatchObject({ city: "Tokyo", days: 2, pace: "moderate", interests: [] });
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("planner: a city with no working mix offers a city change (push CH3)", () => {
  beforeEach(() => { localStorage.clear(); nav.push.mockReset(); nav.toast.mockReset(); Element.prototype.scrollTo = () => {}; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("the toast action clears the city and opens the city step, with no second request", async () => {
    const fetchMock = vi.fn(json(NextResponse.json({ error: "insufficient_verified_spots", message: "Localley cannot plan Tokyo yet. Pick another city to get your free plan now.", pickCity: true }, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) })); });
    await waitFor(() => expect(nav.toast).toHaveBeenCalled());
    const shown = nav.toast.mock.calls.at(-1)![0] as { title: string; action: { props: { onClick: () => void; children: string } } };
    expect(shown.title).toBe(PICK_CITY_LABEL);
    expect(shown.action.props.children).toBe(PICK_CITY_LABEL);
    await act(async () => { shown.action.props.onClick(); });
    // City cleared: the one-tap start for Tokyo is gone until a city is picked again.
    await waitFor(() => expect(screen.queryByRole("button", { name: getQuickStartLabel(3) })).toBeNull());
    expect(screen.getByRole("button", { name: /Tokyo/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("parsePlanSuggestion (push CG3)", () => {
  it("accepts only a valid days/pace/interests mix", () => {
    expect(parsePlanSuggestion({ days: 2, pace: "relaxed", interests: ["food"] })).toEqual({ days: 2, pace: "relaxed", interests: ["food"] });
    for (const bad of [null, "x", { days: 0, pace: "relaxed", interests: [] }, { days: 15, pace: "relaxed", interests: [] },
      { days: 2.5, pace: "relaxed", interests: [] }, { days: 2, pace: "slow", interests: [] }, { days: 2, pace: "relaxed", interests: [1] }]) {
      expect(parsePlanSuggestion(bad)).toBeNull();
    }
  });
});
