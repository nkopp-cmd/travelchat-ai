import { describe, expect, it } from "vitest";
import {
  compareRelatedSpotCandidates,
  formatRelatedSpotDistance,
  getRelatedSpotSortScore,
  getSpotDistanceKm,
  hasUsableSpotCoordinate,
} from "@/lib/spots/proximity";

describe("spot proximity", () => {
  const current = {
    lat: 37.5701,
    lng: 126.9996,
    category: "Market",
    localleyScore: 5,
    localPercentage: 88,
  };

  it("calculates useful distances only for real coordinates", () => {
    expect(hasUsableSpotCoordinate(37.57, 126.99)).toBe(true);
    expect(hasUsableSpotCoordinate(0, 0)).toBe(false);

    const distance = getSpotDistanceKm(current, {
      lat: 37.571,
      lng: 127.001,
    });

    expect(distance).not.toBeNull();
    expect(distance || 0).toBeLessThan(0.2);
    expect(getSpotDistanceKm(current, { lat: 0, lng: 0 })).toBeNull();
  });

  it("prioritizes genuinely close related spots before high-score city-only picks", () => {
    const closeCandidate = {
      lat: 37.571,
      lng: 127.001,
      category: "Cafe",
      localleyScore: 4,
      localPercentage: 70,
    };
    const farCandidate = {
      lat: 37.79,
      lng: 127.18,
      category: "Market",
      localleyScore: 6,
      localPercentage: 96,
    };
    const cityOnlyCandidate = {
      lat: 0,
      lng: 0,
      category: "Market",
      localleyScore: 6,
      localPercentage: 99,
    };

    expect(getRelatedSpotSortScore(current, closeCandidate)).toBeLessThan(
      getRelatedSpotSortScore(current, farCandidate),
    );
    expect(getRelatedSpotSortScore(current, closeCandidate)).toBeLessThan(
      getRelatedSpotSortScore(current, cityOnlyCandidate),
    );
    expect(
      compareRelatedSpotCandidates(current, closeCandidate, farCandidate),
    ).toBeLessThan(0);
  });

  it("formats distance labels without overstating precision", () => {
    expect(formatRelatedSpotDistance(null)).toBe("Same-city pick");
    expect(formatRelatedSpotDistance(0.42)).toBe("420 m away");
    expect(formatRelatedSpotDistance(1.234)).toBe("1.2 km away");
    expect(formatRelatedSpotDistance(14.7)).toBe("15 km in the city");
  });
});
