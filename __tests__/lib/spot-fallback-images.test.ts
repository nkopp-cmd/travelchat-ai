import { describe, expect, it } from "vitest";
import { getSpotFallbackImageUrl } from "@/lib/spots/spot-fallback-images";

describe("getSpotFallbackImageUrl", () => {
  it("returns a stable high-quality image for the same spot", () => {
    const input = {
      name: "Bar Cham",
      category: "Nightlife",
      city: "Seoul",
      address: "Jahamun-ro, Jongno-gu, Seoul",
      width: 1200,
      height: 900,
      quality: 90,
    };

    const first = getSpotFallbackImageUrl(input);
    const second = getSpotFallbackImageUrl(input);

    expect(first).toBe(second);
    expect(first).toContain("images.unsplash.com");
    expect(first).toContain("w=1200");
    expect(first).toContain("h=900");
    expect(first).toContain("q=90");
  });

  it("varies fallback images across different spots in the same city", () => {
    const first = getSpotFallbackImageUrl({
      name: "Bar Cham",
      category: "Nightlife",
      city: "Seoul",
      address: "Jahamun-ro, Jongno-gu, Seoul",
    });
    const second = getSpotFallbackImageUrl({
      name: "Le Chamber",
      category: "Nightlife",
      city: "Seoul",
      address: "Dosan-daero, Gangnam-gu, Seoul",
    });

    expect(first).not.toBe(second);
  });
});
