import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ItineraryInsightsPanel } from "@/components/itinerary/itinerary-insights-panel";

const insights = [
  {
    id: "transport-1",
    label: "Subway timing",
    text: "Use line 2 before rush hour.",
    kind: "transport" as const,
  },
  {
    id: "local-1",
    label: "Cash tip",
    text: "Bring small bills for market stalls.",
    kind: "local" as const,
  },
  {
    id: "insight-1",
    label: "Booking note",
    text: "Reserve tea service on weekends.",
    kind: "insight" as const,
  },
];

describe("ItineraryInsightsPanel", () => {
  it("groups trip notes by transport, local, and context", () => {
    render(<ItineraryInsightsPanel insights={insights} />);

    expect(screen.getByText("Getting around")).toBeTruthy();
    expect(screen.getByText("Local tips")).toBeTruthy();
    expect(screen.getByText("Trip context")).toBeTruthy();
    expect(screen.getByText("Subway timing")).toBeTruthy();
    expect(screen.getByText("Cash tip")).toBeTruthy();
    expect(screen.getByText("Booking note")).toBeTruthy();
  });

  it("keeps compact chat notes tight by hiding the description", () => {
    render(
      <ItineraryInsightsPanel
        insights={insights.slice(0, 1)}
        description="This long helper should not appear in compact chat previews."
        compact
      />,
    );

    expect(screen.getByText("Trip notes")).toBeTruthy();
    expect(
      screen.queryByText("This long helper should not appear in compact chat previews."),
    ).toBeNull();
  });
});
