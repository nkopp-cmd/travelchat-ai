import type { ImgHTMLAttributes } from "react";
import type { PhotoGalleryResponse } from "@/lib/spots/photo-contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItineraryActivityCard } from "@/components/activities/itinerary-activity-card";

vi.mock("next/image", () => ({ default: ({ src, alt, onLoad, onError }: ImgHTMLAttributes<HTMLImageElement>) =>
 // eslint-disable-next-line @next/next/no-img-element
 <img src={src} alt={alt} onLoad={onLoad} onError={onError} /> }));
const galleryMock = vi.hoisted(() => ({ use: vi.fn(), result: { ref: { current: null }, data: { status: "available", photos: [{ id: "fresh", url: "/api/places/photo?name=places/owned/photos/fresh", sourceLabel: "Google listing photo", attributions: [{ displayName: "Owned author" }] }] } as PhotoGalleryResponse | null, loading: false } }));
vi.mock("@/components/spots/venue-photo-provider", () => ({ useVenuePhotos: (...args: unknown[]) => { galleryMock.use(...args); return galleryMock.result; } }));
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
  it("resolves a fresh attributed image by grounded spot ID without rendering the expired URL", () => {
    const old = "/api/places/photo?name=places/owned/photos/expired";
    render(<ItineraryActivityCard activity={{ name: "Owned venue", spotId: "550e8400-e29b-41d4-a716-446655440000", image: old }} city="Seoul" />);
    expect(galleryMock.use).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", false, [], true);
    const image = screen.getByRole("img", { name: "Owned venue" });
    expect(image.getAttribute("src")).toContain("fresh"); expect(image.getAttribute("src")).not.toContain("expired");
    expect(screen.getByText("Owned author")).toBeTruthy();
  });
  it("does not request legacy expired images without a grounded identity", () => {
    galleryMock.result = { ...galleryMock.result, data: null };
    render(<ItineraryActivityCard activity={{ name: "Legacy venue", image: "/api/places/photo?name=places/other/photos/expired" }} city="Seoul" />);
    expect(galleryMock.use).toHaveBeenCalledWith("", false, [], false);
    expect(screen.getByText("Photo unavailable")).toBeTruthy(); expect(screen.queryByRole("img", { name: "Legacy venue" })).toBeNull();
  });
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
    expect(screen.getByText("Verified pin")).toBeTruthy();
    expect(
      screen.getByText("Matched with place data for a more exact map result."),
    ).toBeTruthy();
    expect(screen.getByText("Open pin")).toBeTruthy();
  });

  it("marks area-level stops as search-first when no matched place is available", () => {
    placePhotoMock.result = {
      photoUrl: null,
      rating: null,
      totalRatings: null,
      phone: null,
      placeId: null,
      formattedAddress: null,
      lat: null,
      lng: null,
      isLoading: false,
    };

    render(
      <ItineraryActivityCard
        activity={{
          name: "Ikseon teahouse",
          address: "Ikseon-dong, Jongno-gu, Seoul",
          description: "Order seasonal tea.",
        }}
        city="Seoul"
        userTier="pro"
      />,
    );

    expect(screen.getByText("Confirm pin")).toBeTruthy();
    expect(
      screen.getByText(
        "Only an area or name is available. Choose the correct map result before routing.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Confirm map")).toBeTruthy();
  });
});
