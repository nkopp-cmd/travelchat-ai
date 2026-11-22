import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerCity } from "@/lib/cities-catalog";

// Push CL1/CL2: a spot page -> planner hand-off names the spot (stored on click, never read from the URL) and the
// generate request carries the spot id, so the free plan is about the place the visitor chose.
const nav = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn(), track: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
vi.mock("next/link", () => ({ default: ({ href, ...props }: { href: string } & Record<string, unknown>) => { delete props.prefetch; return <a href={href} {...props} />; } }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn(), funnelSource: () => "direct" }));
vi.mock("@/lib/spot-analytics", () => ({ trackSpotEvent: nav.track }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: nav.toast, dismiss: vi.fn(), toasts: [] }), toast: nav.toast }));
import { ItineraryWizard, getQuickStartLabel } from "@/components/itineraries/wizard";
import { SpotEventLink } from "@/components/spots/spot-event-link";
import { plannerStartFromQuery } from "@/lib/trips/planner-query";
import { HANDOFF_KEY, cleanHandoffName, readHandoffName, rememberHandoffSpot, spotOfferLine } from "@/lib/trips/spot-handoff";
import { SPOT_QUICK_START_OFFER } from "@/lib/offer-copy";

const SPOT = "009d12fb-34fa-465e-983a-1d426cad5992";
const OTHER = "11111111-2222-4333-8444-555555555555";
const cities = [
  { slug: "tokyo", name: "Tokyo", emoji: "*", vibe: "Tokyo vibe", spotCount: 429, status: "recommended" },
] as unknown as PlannerCity[];

function planner(search: string) {
  const { initialData, initialStep } = plannerStartFromQuery(search, null);
  return render(<ItineraryWizard initialData={initialData} initialStep={initialStep} initialCities={cities} />);
}

describe("spot hand-off name (push CL1)", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); nav.push.mockReset(); nav.track.mockReset(); Element.prototype.scrollTo = () => {}; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("a stored name is shown only for the same spot id and never longer than 48 chars", () => {
    fc.assert(fc.property(fc.string(), fc.uuid(), fc.uuid(), (name, id, other) => {
      const raw = JSON.stringify({ id, name });
      const shown = readHandoffName(raw, id);
      expect(shown).toBe(cleanHandoffName(name));
      if (shown) expect(shown.length).toBeLessThanOrEqual(48);
      if (other !== id) expect(readHandoffName(raw, other)).toBeNull();
    }));
    expect(readHandoffName("not json", SPOT)).toBeNull();
    expect(readHandoffName(JSON.stringify({ id: SPOT, name: 42 }), SPOT)).toBeNull();
    expect(readHandoffName(JSON.stringify({ id: SPOT, name: "x" }), undefined)).toBeNull();
  });

  it("the spot page plan link stores the name on a plain click only", () => {
    render(<SpotEventLink spotId={SPOT} event="add_to_trip" handoffName="  Dotonbori   Canal " href={`/itineraries/new?spot=${SPOT}&city=Osaka`}>Plan</SpotEventLink>);
    fireEvent.click(screen.getByText("Plan"), { button: 1 });
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeNull();
    fireEvent.click(screen.getByText("Plan"));
    expect(JSON.parse(sessionStorage.getItem(HANDOFF_KEY)!)).toEqual({ id: SPOT, name: "Dotonbori Canal" });
    expect(nav.track).toHaveBeenCalledWith("add_to_trip", SPOT);
  });

  it("a click that a handler cancels stores nothing", () => {
    render(<SpotEventLink spotId={SPOT} event="add_to_trip" handoffName="Dotonbori" onClick={e => e.preventDefault()} href="/x">Go</SpotEventLink>);
    fireEvent.click(screen.getByText("Go"));
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeNull();
  });

  it("the planner names the stored spot in the city box and the offer line", () => {
    rememberHandoffSpot(SPOT, "Dotonbori Canal");
    planner(`?spot=${SPOT}&city=Tokyo`);
    expect(screen.getByText("Dotonbori Canal is in your Tokyo plan")).toBeTruthy();
    // 390 px: the line wraps, so the city stays visible (truncate cut it live).
    expect(screen.getByText("Dotonbori Canal is in your Tokyo plan").className).not.toMatch(/\btruncate\b/);
    expect(screen.getByText(spotOfferLine("Dotonbori Canal"))).toBeTruthy();
  });

  it("a name stored for another spot, or none, keeps today's generic screen", () => {
    rememberHandoffSpot(OTHER, "Somewhere Else");
    planner(`?spot=${SPOT}&city=Tokyo`);
    expect(screen.queryByText(/Somewhere Else/)).toBeNull();
    expect(screen.getByText("Tokyo selected")).toBeTruthy();
    expect(screen.getByText(SPOT_QUICK_START_OFFER)).toBeTruthy();
  });

  it("a crafted name in the URL is never shown", () => {
    planner(`?spot=${SPOT}&city=Tokyo&name=Send%20money%20here`);
    expect(screen.queryByText(/Send money/)).toBeNull();
  });
});

describe("spot hand-off generate request (push CL2)", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); nav.push.mockReset(); Element.prototype.scrollTo = () => {}; });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function quickStartBody(search: string) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    planner(search);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) })); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).find(([url]) => url === "/api/itineraries/generate")!;
    return JSON.parse(String(call[1].body)) as { spotId?: string; city?: string };
  }

  it("quick start sends the spot id and the city", async () => {
    const body = await quickStartBody(`?spot=${SPOT}&city=Tokyo`);
    expect(body.spotId).toBe(SPOT);
    expect(body.city).toBe("Tokyo");
  });

  it("a bad spot id is dropped, the plan still starts", async () => {
    const body = await quickStartBody("?spot=not-a-uuid&city=Tokyo");
    expect(body.spotId).toBeUndefined();
    expect(body.city).toBe("Tokyo");
  });
});
