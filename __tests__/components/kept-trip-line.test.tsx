// Push BM2: the sign-up page from Save names the trip this browser keeps.
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeptTripLine, keptTripLabel } from "@/components/auth/kept-trip-line";
import { GENERATED_PREVIEW_KEY, storeGeneratedPreview } from "@/lib/trips/generated-preview";

const plan = (days: number) => ({
  title: "Tokyo like a local", city: "Tokyo", days,
  dailyPlans: Array.from({ length: days }, (_, i) => ({ day: i + 1, activities: [{ name: `Stop ${i + 1}` }] })),
});

describe("KeptTripLine", () => {
  afterEach(() => localStorage.clear());

  it("names the kept trip with city and days", () => {
    storeGeneratedPreview(localStorage, plan(3));
    render(<KeptTripLine />);
    expect(screen.getByTestId("kept-trip").textContent).toBe("Saving Tokyo like a local (Tokyo, 3 days)");
  });

  it("renders nothing without a kept trip or with a broken one", () => {
    const { container, unmount } = render(<KeptTripLine />);
    expect(container.innerHTML).toBe("");
    unmount();
    localStorage.setItem(GENERATED_PREVIEW_KEY, "{not json");
    expect(render(<KeptTripLine />).container.innerHTML).toBe("");
  });

  it("uses the singular for one day", () => {
    expect(keptTripLabel({ version: 1, id: "x", createdAt: 0, itinerary: plan(1) })?.detail).toBe("Tokyo, 1 day");
  });
});
