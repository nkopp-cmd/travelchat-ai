import { describe, expect, it } from "vitest";
import {
  buildSpotDirectionsUrl,
  getSpotDirectionsSearchText,
  isKoreanLocation,
} from "@/lib/spots/map-links";

describe("spot map links", () => {
  it("builds exact search text from spot name and address", () => {
    expect(
      getSpotDirectionsSearchText({
        name: "LADRIO",
        address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
      }),
    ).toBe("LADRIO, 1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo");
  });

  it("routes to exact coordinates when no trusted place match exists", () => {
    const url = new URL(
      buildSpotDirectionsUrl({
        name: "LADRIO",
        address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
        lat: 35.6901,
        lng: 139.7569,
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("35.6901,139.7569");
    expect(url.searchParams.has("destination_place_id")).toBe(false);
  });

  it("searches exact name and address when no coordinate or trusted place match exists", () => {
    const url = new URL(
      buildSpotDirectionsUrl({
        name: "LADRIO",
        address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe(
      "LADRIO, 1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
    );
  });

  it("uses Google directions with a Place ID when a trusted exact match is available", () => {
    const url = new URL(
      buildSpotDirectionsUrl({
        name: "Popiah Cart",
        address: "12 Jalan Hang Lekir, Kuala Lumpur, Malaysia",
        lat: 3.1447,
        lng: 101.6977,
        googlePlaceId: "ChIJ-test-place",
      }),
    );

    expect(url.searchParams.get("destination")).toBe(
      "Popiah Cart, 12 Jalan Hang Lekir, Kuala Lumpur, Malaysia",
    );
    expect(url.searchParams.get("destination_place_id")).toBe(
      "ChIJ-test-place",
    );
  });

  it("opens Google Maps search for area-level records instead of routing to imported coordinates", () => {
    const url = new URL(
      buildSpotDirectionsUrl({
        name: "Saphan Mai Market",
        address: "Saphan Mai, Bangkok",
        lat: 13.9101,
        lng: 100.6149,
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe(
      "Saphan Mai Market, Saphan Mai, Bangkok",
    );
    expect(url.searchParams.has("destination")).toBe(false);
  });

  it("searches by name and area when non-Korean area-level records have no usable pin", () => {
    const url = new URL(
      buildSpotDirectionsUrl({
        name: "Westin Tokyo Garden",
        address: "Westin Tokyo, Meguro-ku, Tokyo",
        lat: 0,
        lng: 0,
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("query")).toBe(
      "Westin Tokyo Garden, Westin Tokyo, Meguro-ku, Tokyo",
    );
    expect(url.searchParams.has("destination_place_id")).toBe(false);
  });

  it("uses trusted Google Place IDs even when stored address text is area-level", () => {
    const url = new URL(
      buildSpotDirectionsUrl({
        name: "Saphan Mai Market",
        address: "Saphan Mai, Bangkok",
        lat: 13.9101,
        lng: 100.6149,
        googlePlaceId: "ChIJ-trusted-market",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("destination")).toBe(
      "Saphan Mai Market, Saphan Mai, Bangkok",
    );
    expect(url.searchParams.get("destination_place_id")).toBe(
      "ChIJ-trusted-market",
    );
  });

  it("uses Kakao search for Korean street-address records with a saved pin", () => {
    const url = buildSpotDirectionsUrl({
      name: "Gwangjang Market",
      address: "88 Changgyeonggung-ro, Jongno-gu, Seoul, Korea",
      lat: 37.5701,
      lng: 126.9996,
    });

    expect(isKoreanLocation("Jongno-gu, Seoul, Korea")).toBe(true);
    expect(url).toBe(
      "https://map.kakao.com/link/search/Gwangjang%20Market%2C%2088%20Changgyeonggung-ro%2C%20Jongno-gu%2C%20Seoul%2C%20Korea",
    );
  });

  it("uses Kakao search for Korean area-level locations even when a saved pin exists", () => {
    const url = buildSpotDirectionsUrl({
      name: "Gwangjang Market",
      address: "Jongno-gu, Seoul, Korea",
      lat: 37.5701,
      lng: 126.9996,
    });

    expect(url).toBe(
      "https://map.kakao.com/link/search/Gwangjang%20Market%2C%20Jongno-gu%2C%20Seoul%2C%20Korea",
    );
  });

  it("uses Kakao search for Korean area-level records without a usable pin", () => {
    const url = buildSpotDirectionsUrl({
      name: "Haengdang Market Alley",
      address: "Haengdang-dong, Seongdong-gu, Seoul, Korea",
      lat: 0,
      lng: 0,
    });

    expect(url).toBe(
      "https://map.kakao.com/link/search/Haengdang%20Market%20Alley%2C%20Haengdang-dong%2C%20Seongdong-gu%2C%20Seoul%2C%20Korea",
    );
  });

  it("falls back to coordinates only when no searchable text exists", () => {
    const url = new URL(
      buildSpotDirectionsUrl({
        name: "",
        address: "",
        lat: 13.9101,
        lng: 100.6149,
      }),
    );

    expect(url.searchParams.get("destination")).toBe("13.9101,100.6149");
  });
});
