import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItineraryActivityCard } from "@/components/activities/itinerary-activity-card";

const placePhotoMock = vi.hoisted(() => ({
  result: {
    photoUrl: null,
    rating: null,
    totalRatings: null,
    phone: null,
    placeId: "ChIJ-ladrio",
    formattedAddress:
      "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
    lat: 35.695,
    lng: 139.758,
    isLoading: false,
  },
}));

vi.mock("@/hooks/use-place-photo", () => ({
  usePlacePhoto: vi.fn(() => placePhotoMock.result),
}));

vi.mock("@/components/ui/city-image", () => ({
  CityImageAvatar: ({ city, className }: { city: string; className?: string }) => (
    <span className={className} data-testid="city-image">
      {city}
    </span>
  ),
}));

vi.mock("@/components/activities/booking-deals-popover", () => ({
  BookingDealsPopover: () => <button type="button">Deals</button>,
}));

describe("ItineraryActivityCard", () => {
  it("shows a matched exact address when the stored itinerary address is area-level", () => {
    render(
      <ItineraryActivityCard
        activity={{
          name: "LADRIO",
          address: "Kanda Jinbocho, Tokyo",
          description: "A tiny kissaten stop.",
        }}
        city="Tokyo"
        userTier="pro"
      />,
    );

    expect(
      screen.getByText(
        "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Kanda Jinbocho, Tokyo")).toBeNull();
    expect(screen.getByText("Matched")).toBeTruthy();
    expect(screen.getByText("Directions")).toBeTruthy();
  });
});
