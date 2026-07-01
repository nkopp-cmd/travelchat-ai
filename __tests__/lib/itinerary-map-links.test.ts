import { describe, expect, it } from "vitest";
import {
  buildActivityMapUrl,
  buildDayRouteUrl,
  getActivitySearchText,
  getDayRouteAddressSummary,
  getPreferredActivityMapAddress,
  hasExactActivityAddress,
} from "@/lib/itineraries/map-links";

describe("itinerary map links", () => {
  it("builds exact activity search text from name, address, and city", () => {
    expect(
      getActivitySearchText(
        {
          name: "LADRIO",
          address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        },
        "Tokyo"
      )
    ).toBe("LADRIO, 1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan");
  });

  it("uses exact Google Maps search URLs for single activities", () => {
    const url = buildActivityMapUrl(
      {
        name: "LADRIO",
        address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
      },
      "Tokyo"
    );

    expect(url).toContain("https://www.google.com/maps/search/");
    expect(decodeURIComponent(url || "")).toContain(
      "query=LADRIO, 1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan"
    );
  });

  it("keeps map actions available when an activity has no stored address", () => {
    const url = buildActivityMapUrl(
      {
        name: "LADRIO",
      },
      "Tokyo"
    );

    expect(url).toContain("https://www.google.com/maps/search/");
    expect(decodeURIComponent(url || "")).toContain("query=LADRIO, Tokyo");
  });

  it("classifies exact and area-level activity addresses for map routing", () => {
    expect(
      hasExactActivityAddress(
        "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
      ),
    ).toBe(true);
    expect(hasExactActivityAddress("Kanda Jinbocho, Tokyo")).toBe(false);
    expect(hasExactActivityAddress("")).toBe(false);
  });

  it("prefers matched place addresses over area-level stored addresses", () => {
    expect(
      getPreferredActivityMapAddress(
        {
          name: "LADRIO",
          address: "Kanda Jinbocho, Tokyo",
        },
        "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
      ),
    ).toBe(
      "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
    );

    expect(
      getPreferredActivityMapAddress(
        {
          name: "LADRIO",
          address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        },
        "Kanda Jinbocho, Tokyo",
      ),
    ).toBe(
      "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
    );
  });

  it("summarizes day route address quality for exact, mixed, and search-first routes", () => {
    expect(
      getDayRouteAddressSummary([
        {
          name: "LADRIO",
          address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        },
        { name: "Ota Market", address: "2-2 Tokai, Ota-ku, Tokyo" },
      ]),
    ).toEqual({
      mode: "exact",
      mappableStopCount: 2,
      exactStopCount: 2,
      searchFirstStopCount: 0,
    });

    expect(
      getDayRouteAddressSummary([
        {
          name: "LADRIO",
          address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        },
        { name: "Book alley", address: "Jinbocho, Tokyo" },
        { name: "Coffee stop" },
      ]),
    ).toEqual({
      mode: "mixed",
      mappableStopCount: 3,
      exactStopCount: 1,
      searchFirstStopCount: 2,
    });

    expect(
      getDayRouteAddressSummary([
        { name: "Ikseon teahouse", address: "Ikseon-dong, Jongno-gu, Seoul" },
      ]),
    ).toEqual({
      mode: "search_first",
      mappableStopCount: 1,
      exactStopCount: 0,
      searchFirstStopCount: 1,
    });
  });

  it("uses name plus address for day route waypoints", () => {
    const url = buildDayRouteUrl(
      [
        { name: "LADRIO", address: "Kanda Jinbocho, Tokyo" },
        { name: "Ota Market", address: "2-2 Tokai, Ota-ku, Tokyo" },
      ],
      "Tokyo"
    );

    const params = new URL(url).searchParams;
    expect(params.get("origin")).toBe("LADRIO, Kanda Jinbocho, Tokyo");
    expect(params.get("destination")).toBe("Ota Market, 2-2 Tokai, Ota-ku, Tokyo");
  });

  it("uses Kakao search URLs for Korean cities", () => {
    const url = buildActivityMapUrl(
      {
        name: "Euljiro Nogari Alley",
        nameKo: "을지로 노가리 골목",
        address: "Eulji-ro 3-ga, Jung-gu, Seoul",
      },
      "Seoul"
    );

    expect(url).toBe(`https://map.kakao.com/link/search/${encodeURIComponent("을지로 노가리 골목")}`);
  });
});
