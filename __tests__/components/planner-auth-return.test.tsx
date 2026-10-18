import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItineraryWizard } from "@/components/itineraries/wizard";
import { parsePlannerDraft, PLANNER_DRAFT_KEY, PLANNER_RESUME_PATH } from "@/lib/trips/planner-draft";
import type { WizardData } from "@/components/itineraries/wizard/wizard-context";

const state = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
const saved: WizardData = {
  city: "Seoul", days: 3, budget: "moderate", interests: ["Food & Dining"],
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
  it("keeps inputs before the request and returns sign-up to explicit review", async () => {
    const fetch = vi.fn().mockImplementation(async () => {
      expect(parsePlannerDraft(localStorage.getItem(PLANNER_DRAFT_KEY))?.data).toEqual(saved);
      return { ok: false, json: async () => ({ error: "signup_required", message: "Sign up" }) };
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
  it("preserves the legacy pending itinerary and its claim return", async () => {
    const itinerary = { title: "Owned mock trip", days: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ isAnonymous: true, itinerary }) }));
    await generate();
    await waitFor(() => expect(state.push).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem("pendingItinerary")!)).toEqual(itinerary);
    expect(new URL(state.push.mock.calls[0][0], "https://www.localley.io").searchParams.get("redirect_url")).toBe("/itineraries/claim");
  });
});
