import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/ui/city-image", () => ({ CityImageAvatar: () => null }));

import { OnboardingPanel } from "@/components/dashboard/onboarding-panel";

// Push CM2: a new account's desktop dashboard leads with the first free plan, and every card does something.
describe("new account onboarding panel (Push CM2)", () => {
  it("the first link is the free plan", () => {
    const { container } = render(<OnboardingPanel />);
    const first = container.querySelector("a");
    expect(first?.getAttribute("href")).toBe("/itineraries/new");
    expect(first?.getAttribute("data-testid")).toBe("onboarding-first-plan");
    expect(screen.getByRole("heading", { name: "Plan your first trip" })).not.toBeNull();
  });

  it("has no dead buttons: every start is a planner link with the city filled in", () => {
    const { container } = render(<OnboardingPanel />);
    expect(container.querySelectorAll("button").length).toBe(0);
    const starts = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const city of ["Seoul", "Tokyo", "Bangkok", "Singapore"]) {
      expect(starts).toContain(`/itineraries/new?city=${city}`);
    }
  });
});
