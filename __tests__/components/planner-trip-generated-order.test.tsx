import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerCity } from "@/lib/cities-catalog";

// AA3 (push 2026-11-16): the anonymous success path must send the trip_generated beacon BEFORE it
// navigates to the preview. Real funnel-analytics module; only navigator.sendBeacon and fetch are stubbed.
const order = vi.hoisted(() => [] as string[]);
const nav = vi.hoisted(() => ({ push: vi.fn((path: string) => { order.push(`push:${path}`); }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
import { ItineraryWizard, getQuickStartLabel } from "@/components/itineraries/wizard";
import { GENERATED_PREVIEW_PATH } from "@/lib/trips/generated-preview";
import { SPOT_EVENTS_URL } from "@/lib/spot-analytics";

const cities = [
  { slug: "tokyo", name: "Tokyo", emoji: "*", vibe: "Tokyo vibe", spotCount: 429, status: "recommended" },
] as unknown as PlannerCity[];

// jsdom's Blob has no text(); FileReader reads it.
const beacons: { url: string; body: Promise<string> }[] = [];

function stubBrowser() {
  Object.defineProperty(navigator, "webdriver", { configurable: true, value: false });
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: null });
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: vi.fn((url: string, data: Blob) => {
    const body = new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(data); });
    beacons.push({ url, body });
    order.push(`beacon:${beacons.length - 1}`);
    return true;
  }) });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (!String(url).includes("/api/itineraries/generate")) return new Response("{}", { status: 404 });
    order.push("generate");
    return Response.json({ success: true, isAnonymous: true, preview: { id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" },
      itinerary: { title: "3 days in Tokyo", city: "Tokyo", days: 3, dailyPlans: [1, 2, 3].map((day) => ({ day, theme: "Back streets",
        activities: [{ name: "A sourced stop", description: "Walk here", time: "10:00", address: "Tokyo" }] })) } });
  }));
}

describe("trip_generated beacon order (AA3)", () => {
  beforeEach(() => { order.length = 0; beacons.length = 0; nav.push.mockClear(); localStorage.clear(); Element.prototype.scrollTo = () => {}; stubBrowser(); });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("sends trip_generated (source direct) to the events URL before router.push to the preview", async () => {
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(GENERATED_PREVIEW_PATH));

    const bodies = await Promise.all(beacons.map(async (beacon) => ({ url: beacon.url, ...JSON.parse(await beacon.body) })));
    const generated = bodies.findIndex((body) => body.funnel?.[0]?.step === "trip_generated");
    expect(generated).toBeGreaterThanOrEqual(0);
    expect(bodies[generated]).toEqual({ url: SPOT_EVENTS_URL, funnel: [{ step: "trip_generated", source: "direct" }] });
    expect(bodies.filter((body) => body.funnel?.[0]?.step === "trip_generated")).toHaveLength(1);
    expect(order.indexOf(`beacon:${generated}`)).toBeLessThan(order.indexOf(`push:${GENERATED_PREVIEW_PATH}`));
  });

  // Push BH3: the Generate click is its own funnel step, sent once and before the generate request.
  it("sends plan_requested once, before the generate request", async () => {
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(GENERATED_PREVIEW_PATH));

    const bodies = await Promise.all(beacons.map(async (beacon) => ({ url: beacon.url, ...JSON.parse(await beacon.body) })));
    const requested = bodies.findIndex((body) => body.funnel?.[0]?.step === "plan_requested");
    expect(requested).toBeGreaterThanOrEqual(0);
    expect(bodies[requested]).toEqual({ url: SPOT_EVENTS_URL, funnel: [{ step: "plan_requested", source: "direct" }] });
    expect(bodies.filter((body) => body.funnel?.[0]?.step === "plan_requested")).toHaveLength(1);
    expect(order.indexOf(`beacon:${requested}`)).toBeLessThan(order.indexOf("generate"));
  });

  it("tags trip_generated with the spots source when the planner was opened from a spot (?spot=)", async () => {
    window.history.replaceState(null, "", "/itineraries/new?spot=0022dc9c-5f13-41fd-9940-38a190795704&city=Tokyo");
    try {
      render(<ItineraryWizard initialCities={cities} />);
      fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
      fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) }));
      await waitFor(() => expect(nav.push).toHaveBeenCalledWith(GENERATED_PREVIEW_PATH));
      const bodies = await Promise.all(beacons.map(async (beacon) => JSON.parse(await beacon.body)));
      expect(bodies.filter((body) => body.funnel?.[0]?.step === "trip_generated")).toEqual([{ funnel: [{ step: "trip_generated", source: "spots" }] }]);
    } finally { window.history.replaceState(null, "", "/"); }
  });

  it("falls back to a keepalive fetch, still before the push, when sendBeacon refuses", async () => {
    (navigator.sendBeacon as ReturnType<typeof vi.fn>).mockImplementation(() => false);
    const fetcher = fetch as unknown as ReturnType<typeof vi.fn>;
    const base = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === SPOT_EVENTS_URL) order.push(`fetch:${String(init?.body)}`);
      return base(url, init);
    });
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    fireEvent.click(screen.getByRole("button", { name: getQuickStartLabel(3) }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(GENERATED_PREVIEW_PATH));
    const sent = order.findIndex((entry) => entry.startsWith("fetch:") && entry.includes("trip_generated"));
    expect(sent).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(order[sent].slice(6))).toEqual({ funnel: [{ step: "trip_generated", source: "direct" }] });
    const call = fetcher.mock.calls.find(([url, init]) => url === SPOT_EVENTS_URL && String(init?.body).includes("trip_generated"))!;
    expect(call[1]).toMatchObject({ method: "POST", keepalive: true });
    expect(sent).toBeLessThan(order.indexOf(`push:${GENERATED_PREVIEW_PATH}`));
  });
});
