import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpotCard } from "@/components/spots/spot-card";
import { LocalleyScale, type Spot } from "@/types";

vi.mock("@/components/spots/save-spot-button", () => ({
  SaveSpotButton: () => <button type="button">Save spot</button>,
}));

const baseSpot: Spot = {
  id: "spot_ladrio",
  name: "LADRIO",
  description: "A tiny kissaten stop for a quiet coffee break.",
  location: {
    lat: 35.69512,
    lng: 139.75846,
    address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
  },
  category: "Cafe",
  subcategories: ["Coffee"],
  localleyScore: LocalleyScale.HIDDEN_GEM,
  localPercentage: 88,
  bestTime: "Late afternoon",
  photos: ["https://images.unsplash.com/photo-123?w=1200&q=90"],
  hasRealPhoto: true,
  googlePlaceId: "ChIJ-ladrio",
  tips: ["Go before the dinner rush."],
  verified: true,
  trending: true,
};

describe("SpotCard", () => {
  it("uses user-facing location trust copy on spot cards", () => {
    render(<SpotCard spot={baseSpot} />);

    expect(screen.getByText("LADRIO")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.queryByText("Place")).toBeNull();
  });

  it("does not disguise missing real imagery as a city or area photo", () => {
    render(
      <SpotCard
        spot={{
          ...baseSpot,
          id: "spot_area_photo",
          photos: ["/images/placeholders/cafe.svg"],
          hasRealPhoto: false,
          googlePlaceId: null,
        }}
      />,
    );

    expect(screen.getAllByText(/Photo needed/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Area photo/)).toBeNull();
  });

  it("keeps trending metadata readable on compact mobile cards", () => {
    const { container } = render(<SpotCard spot={baseSpot} compact />);

    expect(screen.getByText("Trending")).toBeTruthy();
    expect(screen.getByText("5/6")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();

    const meta = container.querySelector("[data-spot-card-meta]");
    expect(meta?.className).toContain(
      "flex-wrap",
    );
    expect(meta?.className).toContain("overflow-visible");

    const trendingChip = screen.getByTitle("Trending");
    expect(trendingChip.className).toContain("max-w-[3.2rem]");
  });

  it("labels community submitted spots on discovery cards", () => {
    render(<SpotCard spot={{ ...baseSpot, communitySubmitted: true }} />);

    expect(screen.getByLabelText("Community submitted spot")).toBeTruthy();
  });
});
