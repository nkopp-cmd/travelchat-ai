import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItineraryWizard } from "@/components/itineraries/wizard";
import { parsePlannerDraft, PLANNER_DRAFT_KEY, PLANNER_RESUME_PATH } from "@/lib/trips/planner-draft";
import { GENERATED_PREVIEW_KEY, GENERATED_PREVIEW_PATH, parseGeneratedPreview } from "@/lib/trips/generated-preview";
import type { WizardData } from "@/components/itineraries/wizard/wizard-context";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { GENERATE_FAILED_MESSAGE } from "@/components/itineraries/wizard";

const state = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn(), funnelSource: () => "direct", clientNavLanding: () => "" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
const saved: WizardData = {
  city: "Seoul", selectedSpotId: "0041a575-c6fd-4a7e-b9c3-56cc50e201d6", startDate: "2026-12-30", days: 3, budget: "moderate", interests: ["Food & Dining"],
  localnessLevel: 4, pace: "relaxed", groupType: "friends", tripMode: "single",
  citySlugs: [], cityNameBySlug: {},
};

const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

describe("wizard authentication return", () => {
  beforeEach(() => {
    state.push.mockReset(); state.toast.mockReset(); localStorage.clear();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear();
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  });
  async function generate() {
    render(<ItineraryWizard initialData={saved} initialStep={3} />);
    const button = screen.getByRole("button", { name: /Generate/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(button); });
  }
  it.each(["legacy", "current"])("keeps inputs before the request and returns sign-up to explicit review (%s)", async format => {
    const fetch = vi.fn().mockImplementation(async () => {
      expect(parsePlannerDraft(localStorage.getItem(PLANNER_DRAFT_KEY))?.data).toEqual(saved);
      return format === "current" ? apiError(ErrorCodes.UNAUTHORIZED, "Sign up")
        : { ok: false, json: async () => ({ error: "signup_required", message: "Sign up" }) };
    });
    vi.stubGlobal("fetch", fetch);
    await generate();
    await waitFor(() => expect(state.push).toHaveBeenCalledTimes(1));
    const target = new URL(state.push.mock.calls[0][0], "https://www.localley.io");
    expect(target.pathname).toBe("/sign-up");
    expect(target.searchParams.get("redirect_url")).toBe(PLANNER_RESUME_PATH);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not request generation when browser storage refuses input recovery", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    await generate();
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("could not keep your trip inputs") })));
    expect(fetch).not.toHaveBeenCalled(); expect(state.push).not.toHaveBeenCalled();
  });
  it("opens the complete anonymous preview without signup and retains the generated itinerary", async () => {
    const itinerary = { title: "Owned mock trip", dailyPlans: [{ day: 1, activities: [{ name: "A source-backed stop", time: "10:00" }] }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isAnonymous: true, itinerary }) }));
    await generate();
    await waitFor(() => expect(state.push).toHaveBeenCalled());
    expect(parseGeneratedPreview(localStorage.getItem(GENERATED_PREVIEW_KEY))?.itinerary).toMatchObject({ ...itinerary, city: saved.city, days: saved.days });
    expect(state.push).toHaveBeenCalledWith(GENERATED_PREVIEW_PATH);
    expect(localStorage.getItem("pendingItinerary")).toBeNull();
  });
  it.each([
    ["a 502 HTML page", () => ({ ok: false, status: 502, json: async () => JSON.parse("<!DOCTYPE html><title>502</title>") })],
    ["a network drop", () => { throw new TypeError("Failed to fetch"); }],
  ])("shows one plain sentence and a Try again that re-sends the same inputs after %s", async (_name, failure) => {
    const itinerary = { title: "Retry trip", dailyPlans: [{ day: 1, activities: [{ name: "Stop", time: "10:00" }] }] };
    const fetch = vi.fn().mockImplementationOnce(async () => failure())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ isAnonymous: true, itinerary }) });
    vi.stubGlobal("fetch", fetch);
    await generate();
    await waitFor(() => expect(state.toast).toHaveBeenCalledTimes(1));
    const shown = state.toast.mock.calls[0][0];
    expect(shown).toMatchObject({ title: "Generation failed", description: GENERATE_FAILED_MESSAGE, variant: "destructive" });
    expect(shown.action.props.altText).toBe("Try again");
    expect(state.push).not.toHaveBeenCalled();
    await act(async () => { shown.action.props.onClick(); });
    await waitFor(() => expect(state.push).toHaveBeenCalledWith(GENERATED_PREVIEW_PATH));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
  });
  it("keeps a server message that is meant for the visitor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { code: "bad_city", message: "Pick an enabled city." } }) }));
    await generate();
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Pick an enabled city." })));
  });
});
