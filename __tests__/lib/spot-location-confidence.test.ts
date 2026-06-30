import { describe, expect, it } from "vitest";
import {
  getSpotLocationConfidence,
  hasSpecificStreetAddress,
  hasUsableCoordinates,
  isAreaLevelAddress,
} from "@/lib/spots/location-confidence";

describe("spot location confidence", () => {
  it("recognizes specific street-style addresses", () => {
    expect(hasSpecificStreetAddress("No. 17, Lane 31, Section 2, Jinshan South Road, Taipei")).toBe(true);
    expect(hasSpecificStreetAddress("〒150-0001 Tokyo, Shibuya City, Jingumae 1 Chome")).toBe(true);
    expect(hasSpecificStreetAddress("Mangwon-dong, Mapo-gu, Seoul")).toBe(false);
  });

  it("flags area-level addresses", () => {
    expect(isAreaLevelAddress("Ta Phin Village, Sa Pa countryside")).toBe(true);
    expect(isAreaLevelAddress("Gion, Kyoto")).toBe(true);
    expect(isAreaLevelAddress("10 Bayfront Avenue, Singapore")).toBe(false);
    expect(isAreaLevelAddress("")).toBe(true);
  });

  it("validates usable coordinates", () => {
    expect(hasUsableCoordinates(37.5701, 127.0099)).toBe(true);
    expect(hasUsableCoordinates(0, 0)).toBe(false);
    expect(hasUsableCoordinates(91, 127)).toBe(false);
    expect(hasUsableCoordinates(null, 127)).toBe(false);
  });

  it("returns exact, pinned, or area confidence with audit reasons", () => {
    expect(
      getSpotLocationConfidence({
        address: "No. 17, Lane 31, Section 2, Jinshan South Road, Taipei",
        lat: 25.033,
        lng: 121.565,
      })
    ).toMatchObject({
      tone: "exact",
      exactAddress: true,
      usableCoordinates: true,
      reasons: [],
    });

    expect(
      getSpotLocationConfidence({
        address: "Gion, Kyoto",
        lat: 35.0037,
        lng: 135.7788,
      })
    ).toMatchObject({
      tone: "pinned",
      exactAddress: false,
      usableCoordinates: true,
      reasons: ["area_level_address"],
    });

    expect(
      getSpotLocationConfidence({
        address: "Gion, Kyoto",
        lat: 0,
        lng: 0,
      })
    ).toMatchObject({
      tone: "area",
      exactAddress: false,
      usableCoordinates: false,
      reasons: ["area_level_address", "missing_or_zero_coordinates"],
    });
  });
});
