import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItineraryWizard, resetPlannerStartForTest } from "@/components/itineraries/wizard";
import { trackFunnelStep } from "@/lib/funnel-analytics";
import type { WizardData } from "@/components/itineraries/wizard/wizard-context";

vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn(), funnelSource: () => "home" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const saved: WizardData = {
  city: "Seoul", startDate: "2026-12-30", days: 3, budget: "moderate", interests: ["Food & Dining"],
  localnessLevel: 4, pace: "relaxed", groupType: "friends", tripMode: "single", citySlugs: [], cityNameBySlug: {},
};
const starts = () => vi.mocked(trackFunnelStep).mock.calls.filter(([step]) => step === "planner_start");

// planner_start is the top of the planner -> trip -> checkout funnel: a page load (bots) must not count.
describe("planner_start signal", () => {
  beforeEach(() => {
    resetPlannerStartForTest(); vi.mocked(trackFunnelStep).mockClear();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  });
  afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, "scrollTo"); });

  it("sends nothing on page load", () => {
    render(<ItineraryWizard initialData={saved} initialStep={3} />);
    expect(starts()).toEqual([]);
  });

  it("sends one start on the first real input, none after it or after a remount", () => {
    const { unmount } = render(<ItineraryWizard initialData={saved} initialStep={3} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(starts()).toEqual([["planner_start", "home"]]);
    fireEvent.click(buttons[buttons.length - 1]);
    unmount();
    render(<ItineraryWizard initialData={saved} initialStep={3} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(starts()).toHaveLength(1);
  });

  it("counts typing as a start", () => {
    const { container } = render(<ItineraryWizard initialData={saved} initialStep={0} />);
    const field = container.querySelector("input, textarea");
    if (field) fireEvent.input(field, { target: { value: "Seo" } });
    else fireEvent.input(container.firstElementChild as Element);
    expect(starts()).toHaveLength(1);
  });
});
