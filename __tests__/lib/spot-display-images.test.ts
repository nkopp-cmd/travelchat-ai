import { describe, expect, it } from "vitest";
import {
  countRealDisplaySpotPhotos,
  getFirstRealDisplaySpotPhoto,
  hasRealDisplaySpotPhoto,
  isRealDisplaySpotPhoto,
} from "@/lib/spots/display-images";

describe("spot display images", () => {
  it("uses the public real-photo classifier for display image selection", () => {
    const placePhoto =
      "/api/places/photo?name=places%2FChIJ-real-place%2Fphotos%2Fabc&w=1200";

    expect(isRealDisplaySpotPhoto("not-a-url")).toBe(false);
    expect(isRealDisplaySpotPhoto("/images/placeholders/cafe.svg")).toBe(false);
    expect(isRealDisplaySpotPhoto("https://images.unsplash.com/photo-1")).toBe(
      false,
    );
    expect(isRealDisplaySpotPhoto(placePhoto)).toBe(true);
  });

  it("selects the first real spot image and ignores placeholders before it", () => {
    const realRemotePhoto = "https://cdn.localley.io/spots/tea-house.jpg";
    const photos = [
      "/images/placeholders/market.svg",
      "not-a-url",
      realRemotePhoto,
      "/api/places/photo?name=places%2FChIJ-real-place%2Fphotos%2Fabc&w=1200",
    ];

    expect(getFirstRealDisplaySpotPhoto(photos)).toBe(realRemotePhoto);
    expect(hasRealDisplaySpotPhoto(photos)).toBe(true);
    expect(countRealDisplaySpotPhotos(photos)).toBe(2);
  });

  it("returns empty real-photo evidence for fallback-only photo sets", () => {
    const photos = [
      "/images/placeholders/default.svg",
      "https://images.unsplash.com/photo-2",
      "",
    ];

    expect(getFirstRealDisplaySpotPhoto(photos)).toBeNull();
    expect(hasRealDisplaySpotPhoto(photos)).toBe(false);
    expect(countRealDisplaySpotPhotos(photos)).toBe(0);
  });
});
