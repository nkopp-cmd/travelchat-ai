import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlannerCity } from "@/lib/cities-catalog";

// Money path: the one-tap free plan is the only free-trip entry (planner_start -> trip_generated).
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn(), funnelSource: () => "direct" }));
import { ItineraryWizard, getQuickStartLabel } from "@/components/itineraries/wizard";
import { GENERATED_PREVIEW_KEY, GENERATED_PREVIEW_PATH } from "@/lib/trips/generated-preview";

const cities = [
  { slug: "seoul", name: "Seoul", emoji: "*", vibe: "Seoul vibe", spotCount: 386, status: "recommended" },
  { slug: "tokyo", name: "Tokyo", emoji: "*", vibe: "Tokyo vibe", spotCount: 429, status: "recommended" },
] as unknown as PlannerCity[];

const PREVIEW_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
let release: () => void = () => {};

function stubGenerate() {
  const fetcher = vi.fn(async (url: string) => {
    if (!String(url).includes("/api/itineraries/generate")) return new Response("{}", { status: 404 });
    await new Promise<void>((resolve) => { release = resolve; });
    return Response.json({ success: true, isAnonymous: true, preview: { id: PREVIEW_ID },
      itinerary: { title: "3 days in Tokyo", city: "Tokyo", days: 3, dailyPlans: [1, 2, 3].map((day) => ({ day, theme: "Back streets",
        activities: [{ name: "A sourced stop", description: "Walk here", time: "10:00", address: "Tokyo" }] })) } });
  });
  vi.stubGlobal("fetch", fetcher);
  return () => fetcher.mock.calls.filter(([url]) => String(url).includes("/api/itineraries/generate"));
}

describe("one-tap free plan (push N, 2026-11-15)", () => {
  beforeEach(() => { localStorage.clear(); nav.push.mockReset(); Element.prototype.scrollTo = () => {}; });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("posts generate once with the tapped city and 3 days, then opens the preview; a double tap posts once", async () => {
    const generateCalls = stubGenerate();
    render(<ItineraryWizard initialCities={cities} />);
    fireEvent.click(screen.getByRole("button", { name: /Tokyo/ }));
    const cta = screen.getByRole("button", { name: getQuickStartLabel(3) });
    fireEvent.click(cta);
    fireEvent.click(cta);
    expect(screen.queryByRole("button", { name: getQuickStartLabel(3) })).toBeNull();
    expect(generateCalls()).toHaveLength(1);
    const [, init] = generateCalls()[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ city: "Tokyo", days: 3 });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("corridor");
    await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await waitFor(() => expect(nav.push.mock.calls).toEqual([[GENERATED_PREVIEW_PATH]]));
    expect(GENERATED_PREVIEW_PATH).toBe("/itineraries/preview");
    expect(generateCalls()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(GENERATED_PREVIEW_KEY) ?? "{}").id).toBe(PREVIEW_ID);
  });
});
