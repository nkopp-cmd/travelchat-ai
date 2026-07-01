import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildChatPreviewInsights,
  ItineraryPreview,
} from "@/components/chat/itinerary-preview";

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
  it("keeps trip notes separate after the day schedule when chat output contains tips", () => {
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
    expect(screen.getByText("Outside the day schedule")).toBeTruthy();

    const daySchedule = screen.getByTestId("chat-day-schedule");
    const tripNotes = screen.getByTestId("chat-trip-notes");

    expect(daySchedule.textContent).toContain("Tsukiji Outer Market");
    expect(daySchedule.textContent).not.toContain("Bring small bills.");
    expect(daySchedule.textContent).not.toContain("Use the subway and walk the last few blocks.");
    expect(tripNotes.textContent).toContain("Bring small bills.");
    expect(tripNotes.textContent).toContain("Use the subway and walk the last few blocks.");

    const renderedText = container.textContent || "";
    expect(renderedText.indexOf("Route by day")).toBeGreaterThan(-1);
    expect(renderedText.indexOf("Trip notes")).toBeGreaterThan(-1);
    expect(renderedText.indexOf("Route by day")).toBeLessThan(
      renderedText.indexOf("Trip notes")
    );
  });

  it("dedupes repeated chat tips before rendering or saving insights", () => {
    expect(
      buildChatPreviewInsights([
        "Bring small bills.",
        " bring   small bills. ",
        "Use the subway from Shinjuku.",
      ]),
    ).toEqual([
      {
        id: "chat-tip-1",
        label: "Local tip",
        text: "Bring small bills.",
        kind: "local",
      },
      {
        id: "chat-tip-2",
        label: "Getting around",
        text: "Use the subway from Shinjuku.",
        kind: "transport",
      },
    ]);
  });
});
