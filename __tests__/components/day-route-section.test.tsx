import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayRouteSection } from "@/components/itinerary/day-route-section";

vi.mock("@/components/activities/itinerary-activity-card", () => ({
  ItineraryActivityCard: ({ activity }: { activity: { name: string } }) => (
    <article>{activity.name}</article>
  ),
}));

describe("DayRouteSection", () => {
  it("shows exact route confidence when every stop has an exact address", () => {
    render(
      <DayRouteSection
        dayIndex={0}
        city="Tokyo"
        userTier="pro"
        dayPlan={{
          day: 1,
          theme: "Bookshops and kissaten",
          activities: [
            {
              name: "LADRIO",
              address:
                "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
            },
            { name: "Ota Market", address: "2-2 Tokai, Ota-ku, Tokyo" },
          ],
        }}
      />,
    );

    expect(screen.getByText("Exact route")).toBeTruthy();
    expect(screen.getByText("All route stops include exact addresses.")).toBeTruthy();
    expect(screen.getByText("2 exact pins")).toBeTruthy();
    expect(screen.getByLabelText("Route order preview")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view route/i })).toBeTruthy();
  });

  it("warns when a day route mixes exact and search-first stops", () => {
    render(
      <DayRouteSection
        dayIndex={0}
        city="Tokyo"
        userTier="pro"
        dayPlan={{
          day: 1,
          activities: [
            {
              name: "LADRIO",
              address:
                "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
            },
            { name: "Book alley", address: "Jinbocho, Tokyo" },
            { name: "Coffee stop" },
          ],
        }}
      />,
    );

    expect(screen.getByText("Review route")).toBeTruthy();
    expect(screen.getByText("2 of 3 stops need map confirmation.")).toBeTruthy();
    expect(screen.getByText("1 exact pin")).toBeTruthy();
    expect(screen.getByText("2 to confirm")).toBeTruthy();
  });

  it("labels Korean map actions as search when Kakao opens the first stop", () => {
    render(
      <DayRouteSection
        dayIndex={0}
        city="Seoul"
        userTier="pro"
        dayPlan={{
          day: 1,
          activities: [
            {
              name: "Ikseon teahouse",
              address: "Ikseon-dong, Jongno-gu, Seoul",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Search-first route")).toBeTruthy();
    expect(
      screen.getByText("Stops rely on names or area-level addresses. Confirm pins before routing."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /kakao search/i })).toBeTruthy();
  });

  it("shows an empty state instead of a blank day body", () => {
    render(
      <DayRouteSection
        dayIndex={0}
        city="Tokyo"
        userTier="pro"
        dayPlan={{
          day: 1,
          activities: [],
        }}
      />,
    );

    expect(screen.getByText("No route yet")).toBeTruthy();
    expect(screen.getByText("No stops are scheduled for this day yet.")).toBeTruthy();
  });
});
