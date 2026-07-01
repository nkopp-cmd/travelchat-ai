import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItineraryPreview } from "@/components/chat/itinerary-preview";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/hooks/use-place-photo", () => ({
  usePlacePhoto: () => ({
    photoUrl: null,
    isLoading: false,
  }),
}));

vi.mock("@/components/ui/city-image", () => ({
  CityImageAvatar: ({ city, className }: { city: string; className?: string }) => (
    <span className={className} data-testid="city-image">
      {city}
    </span>
  ),
}));

describe("ItineraryPreview", () => {
  it("renders trip notes before the day schedule when chat output contains tips", () => {
    const { container } = render(
      <ItineraryPreview
        content={`# Tokyo Hidden Gems

**Day 1: Local Food**

- **Tsukiji Outer Market (Local Favorite)**: Snack through named stalls in the morning.
  Address: Tsukiji Outer Market, Chuo City, Tokyo
- **Getting around**: Use the subway and walk the last few blocks.

**Local Tips**
- Bring small bills.
`}
      />
    );

    expect(screen.getByText("Route by day")).toBeTruthy();
    expect(screen.getByText("Trip notes")).toBeTruthy();
    expect(screen.getByText("Getting around")).toBeTruthy();

    const renderedText = container.textContent || "";
    expect(renderedText.indexOf("Route by day")).toBeGreaterThan(-1);
    expect(renderedText.indexOf("Trip notes")).toBeGreaterThan(-1);
    expect(renderedText.indexOf("Trip notes")).toBeLessThan(
      renderedText.indexOf("Route by day")
    );
  });
});
