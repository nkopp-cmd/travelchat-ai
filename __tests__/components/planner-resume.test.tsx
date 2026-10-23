import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savePlannerDraft, PLANNER_DRAFT_TTL } from "@/lib/trips/planner-draft";
import type { WizardData } from "@/components/itineraries/wizard/wizard-context";

const state = vi.hoisted(() => ({ query: "" }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn(), funnelSource: () => "direct" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/components/itineraries/wizard", () => ({
  ItineraryWizard: (props: unknown) => <pre data-testid="wizard-inputs">{JSON.stringify(props)}</pre>,
}));
import NewItineraryPage from "@/app/itineraries/new/page";

const saved: WizardData = {
  city: "Seoul", selectedSpotId: "0041a575-c6fd-4a7e-b9c3-56cc50e201d6", startDate: "2026-12-30", days: 3, budget: "moderate", interests: ["Food & Dining"],
  localnessLevel: 4, pace: "relaxed", groupType: "friends", tripMode: "single",
  citySlugs: [], cityNameBySlug: {},
};
const props = () => JSON.parse(screen.getByTestId("wizard-inputs").textContent!);

describe("explicit planner resume", () => {
  beforeEach(() => { state.query = ""; localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  it("keeps a card's canonical spot reference when starting a new plan", () => {
    state.query = "city=Seoul&spot=0041A575-C6FD-4A7E-B9C3-56CC50E201D6";
    render(<NewItineraryPage />);
    expect(props()).toEqual({ initialData: { city: "Seoul", selectedSpotId: saved.selectedSpotId }, initialStep: 1 });
  });
  it("ignores a malformed spot reference without importing it into inputs", () => {
    state.query = "city=Seoul&spot=..%2Fprivate";
    render(<NewItineraryPage />);
    expect(props()).toEqual({ initialData: { city: "Seoul" }, initialStep: 1 });
  });
  it("restores all saved inputs only on an explicit same-origin resume", () => {
    savePlannerDraft(localStorage, saved);
    state.query = "resume=1";
    render(<NewItineraryPage />);
    expect(props()).toEqual({ initialData: saved, initialStep: 3 });
    expect(screen.getByRole("status").textContent).toContain("inputs are restored");
  });
  it("starts fresh when resume was not requested", () => {
    savePlannerDraft(localStorage, saved);
    render(<NewItineraryPage />);
    expect(props()).toEqual({ initialData: {}, initialStep: 0 });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("uses explicit URL edits without changing the saved inputs", () => {
    savePlannerDraft(localStorage, saved);
    state.query = "resume=1&city=Tokyo&days=2&group=couple";
    render(<NewItineraryPage />);
    expect(props().initialData).toMatchObject({ city: "Tokyo", days: 2, groupType: "couple", interests: saved.interests });
  });
  it("does not restore an expired plan", () => {
    savePlannerDraft(localStorage, saved, Date.now() - PLANNER_DRAFT_TTL);
    state.query = "resume=1";
    render(<NewItineraryPage />);
    expect(props().initialData).toEqual({});
    expect(screen.getByRole("status").textContent).toContain("Start a new plan");
  });
  it("keeps local inputs out of the server-rendered page", () => {
    savePlannerDraft(localStorage, saved);
    state.query = "resume=1";
    const html = renderToString(<NewItineraryPage />);
    expect(html).not.toContain("Food &amp; Dining");
    expect(html).not.toContain("Seoul");
    expect(html).not.toContain(saved.selectedSpotId);
  });
});
