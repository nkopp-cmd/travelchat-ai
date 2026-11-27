import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DayRouteSection } from "@/components/itinerary/day-route-section";

vi.mock("@/components/activities/itinerary-activity-card", () => ({
  ItineraryActivityCard: ({ activity }: { activity: { name: string } }) => (
    <article>{activity.name}</article>
  ),
}));

describe("DayRouteSection", () => {
  it("is a jump target named after its day", () => {
    render(<DayRouteSection dayIndex={1} city="Seoul" userTier="free" dayPlan={{ day: 2, activities: [{ name: "Market" }] }} />);
    const section = screen.getByRole("region", { name: "Day 2" });
    expect(section.id).toBe("day-2");
  });

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

  describe("GetYourGuide day link (Push DR2)", () => {
    afterEach(() => vi.unstubAllEnvs());
    const dayPlan = { day: 3, activities: [{ name: "Gyeongbokgung Palace", category: "Palace" }, { name: "Cafe Onion", category: "Cafe" }] };

    it("shows one sponsored link for the day's bookable stop when a partner id exists", () => {
      vi.stubEnv("GETYOURGUIDE_PARTNER_ID", "AB12CDE");
      render(<DayRouteSection dayIndex={2} city="Seoul" userTier="free" dayPlan={dayPlan} />);
      const links = screen.getAllByTestId("itinerary-day-gyg-link");
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute("href")).toContain("partner_id=AB12CDE");
      expect(links[0].getAttribute("rel")).toContain("sponsored");
      expect(links[0].textContent).toContain("Gyeongbokgung Palace");
    });

    it("shows no link without a real partner id", () => {
      vi.stubEnv("GETYOURGUIDE_PARTNER_ID", "localley");
      render(<DayRouteSection dayIndex={2} city="Seoul" userTier="free" dayPlan={dayPlan} />);
      expect(screen.queryByTestId("itinerary-day-gyg-link")).toBeNull();
    });
  });
});
