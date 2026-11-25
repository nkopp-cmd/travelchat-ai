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

  it("lists only the cities the planner offers (Push DD1), the full list when the catalog is unavailable", () => {
    const { container } = render(<OnboardingPanel plannerCityNames={["Tokyo", "Seoul", "Ubud, Bali"]} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/itineraries/new?city=Ubud%2C%20Bali");
    for (const city of ["Nara", "Jeju", "Canggu%2C%20Bali"]) expect(hrefs).not.toContain(`/itineraries/new?city=${city}`);
    expect(screen.getByText("3")).not.toBeNull();
    const fallback = render(<OnboardingPanel plannerCityNames={null} />);
    expect([...fallback.container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("/itineraries/new?city=Nara");
  });
});
