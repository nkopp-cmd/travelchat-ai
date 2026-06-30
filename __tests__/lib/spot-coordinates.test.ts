import { describe, expect, it } from "vitest";
import {
  getSpotCoordinateValues,
  parseSpotCoordinates,
} from "@/lib/spots/coordinates";

describe("spot coordinate parsing", () => {
  it("parses GeoJSON-style point coordinates", () => {
    expect(
      parseSpotCoordinates({ type: "Point", coordinates: [139.7715977, 35.6640869] })
    ).toEqual({
      lat: 35.6640869,
      lng: 139.7715977,
    });
  });

  it("parses WKT point coordinates", () => {
    expect(parseSpotCoordinates("POINT(126.9024 37.5558)")).toEqual({
      lat: 37.5558,
      lng: 126.9024,
    });
  });

  it("parses Supabase PostGIS EWKB hex point coordinates", () => {
    expect(
      parseSpotCoordinates("0101000020E610000067E5A8EDB0786140DC99AECC00D54140")
    ).toEqual({
      lat: 35.6640869,
      lng: 139.7715977,
    });
  });

  it("falls back to zero values for invalid coordinates", () => {
    expect(parseSpotCoordinates("not-a-point")).toBeNull();
    expect(getSpotCoordinateValues("not-a-point")).toEqual({ lat: 0, lng: 0 });
  });
});
