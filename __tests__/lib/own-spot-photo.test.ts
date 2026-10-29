// @vitest-environment node
import { describe, expect, it } from "vitest";
import { directSpotPhotos, ownSpotPhotoPath } from "@/lib/spots/own-photo";
import { getDirectVenuePhotos } from "@/components/spots/venue-photo-provider";

const spotId = "00000000-0000-4000-8000-000000000001";
const own = `/media/spot/${spotId}/${"a".repeat(64)}.webp`;

describe("own spot photo first, Google Places only as fallback", () => {
  it("maps only real spot_photos keys to the public path", () => {
    expect(ownSpotPhotoPath(`spot-photos/${spotId}/${"a".repeat(64)}.webp`)).toBe(own);
    for (const bad of [null, undefined, 3, "", "tips/x.webp", `spot-photos/${spotId}/${"a".repeat(64)}.jpg`, `spot-photos/../${"a".repeat(64)}.webp`]) {
      expect(ownSpotPhotoPath(bad)).toBeNull();
    }
  });

  it("a Google listing with an own photo shows it without a Places call; without one it falls back to Places", () => {
    expect(directSpotPhotos({ ownPhoto: own, googlePlaceId: "ChIJ1", photos: ["https://x/a.jpg"] })).toEqual([own]);
    expect(directSpotPhotos({ ownPhoto: null, googlePlaceId: "ChIJ1", photos: ["https://x/a.jpg"] })).toEqual([]);
  });

  it("other spots keep their direct photos after the own photo, without Places proxy URLs or duplicates", () => {
    const photos = ["https://cdn.example.com/a.jpg", "/api/places/photo?name=places/1", own];
    expect(directSpotPhotos({ ownPhoto: own, photos })).toEqual([own, "https://cdn.example.com/a.jpg"]);
    expect(directSpotPhotos({ photos })).toEqual(["https://cdn.example.com/a.jpg", own]);
  });

  it("the gallery accepts the own photo first and labels it", () => {
    const [first] = getDirectVenuePhotos(directSpotPhotos({ ownPhoto: own, googlePlaceId: "ChIJ1", photos: [] }));
    expect(first).toMatchObject({ url: own, sourceLabel: "Localley traveller photo" });
  });
});
