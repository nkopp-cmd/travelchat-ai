import { describe, expect, it } from "vitest";

import {
  getRecommendationSpotCity,
  getRecommendationSpotImage,
} from "@/components/dashboard/recommendations-widget";

describe("RecommendationsWidget helpers", () => {
  it("infers the real city from exact recommendation addresses", () => {
    expect(
      getRecommendationSpotCity({
        name: "LADRIO",
        address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
        lat: 35.695,
        lng: 139.758,
      }),
    ).toBe("Tokyo");
  });

  it("uses own place photos with a high-quality fallback attached", () => {
    const image = getRecommendationSpotImage(
      {
        name: "LADRIO",
        address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
        category: "Cafe",
        photos: ["/api/places/photo?name=places%2FChIJ-ladrio%2Fphotos%2Fphoto_1&w=900"],
        lat: 35.695,
        lng: 139.758,
      },
      { width: 900, height: 506, quality: 90 },
    );

    expect(image.isFallback).toBe(false);
    expect(image.src).toContain("/api/places/photo?");
    expect(image.src).toContain("fallback=");
  });

  it("falls back to a contextual area image when no real spot photo is available", () => {
    const image = getRecommendationSpotImage(
      {
        name: "Placeholder Cafe",
        address: "Jongno-gu, Seoul",
        category: "Cafe",
        photos: ["/images/placeholders/cafe.svg"],
        lat: 37.573,
        lng: 126.979,
      },
      { width: 640, height: 360, quality: 90 },
    );

    expect(image.isFallback).toBe(true);
    expect(image.src).toContain("images.unsplash.com");
    expect(image.src).toContain("w=640");
    expect(image.src).toContain("h=360");
    expect(image.src).toContain("q=90");
  });
});
