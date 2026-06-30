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
            })
        ).toBe("LADRIO, 1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo");
    });

    it("uses exact name and address for Google directions before coordinates", () => {
        const url = new URL(
            buildSpotDirectionsUrl({
                name: "LADRIO",
                address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
                lat: 35.6901,
                lng: 139.7569,
            })
        );

        expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
        expect(url.searchParams.get("api")).toBe("1");
        expect(url.searchParams.get("destination")).toBe(
            "LADRIO, 1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo"
        );
    });

    it("includes a Google Place ID when available", () => {
        const url = new URL(
            buildSpotDirectionsUrl({
                name: "Popiah Cart",
                address: "Jalan Hang Lekir, Kuala Lumpur, Malaysia",
                lat: 3.1447,
                lng: 101.6977,
                googlePlaceId: "ChIJ-test-place",
            })
        );

        expect(url.searchParams.get("destination")).toBe(
            "Popiah Cart, Jalan Hang Lekir, Kuala Lumpur, Malaysia"
        );
        expect(url.searchParams.get("destination_place_id")).toBe("ChIJ-test-place");
    });

    it("routes to saved coordinates when the stored address is area-level", () => {
        const url = new URL(
            buildSpotDirectionsUrl({
                name: "Saphan Mai Market",
                address: "Saphan Mai, Bangkok",
                lat: 13.9101,
                lng: 100.6149,
            })
        );

        expect(url.searchParams.get("destination")).toBe("13.9101,100.6149");
    });

    it("searches by name and area when non-Korean area-level records have no usable pin", () => {
        const url = new URL(
            buildSpotDirectionsUrl({
                name: "Westin Tokyo Garden",
                address: "Westin Tokyo, Meguro-ku, Tokyo",
                lat: 0,
                lng: 0,
            })
        );

        expect(url.searchParams.get("destination")).toBe(
            "Westin Tokyo Garden, Westin Tokyo, Meguro-ku, Tokyo"
        );
        expect(url.searchParams.has("destination_place_id")).toBe(false);
    });

    it("uses Kakao search for Korean locations", () => {
        const url = buildSpotDirectionsUrl({
            name: "Gwangjang Market",
            address: "88 Changgyeonggung-ro, Jongno-gu, Seoul, Korea",
            lat: 37.5701,
            lng: 126.9996,
        });

        expect(isKoreanLocation("Jongno-gu, Seoul, Korea")).toBe(true);
        expect(url).toBe(
            "https://map.kakao.com/link/search/Gwangjang%20Market%2C%2088%20Changgyeonggung-ro%2C%20Jongno-gu%2C%20Seoul%2C%20Korea"
        );
    });

    it("uses Kakao coordinate routing for Korean area-level locations with a saved pin", () => {
        const url = buildSpotDirectionsUrl({
            name: "Gwangjang Market",
            address: "Jongno-gu, Seoul, Korea",
            lat: 37.5701,
            lng: 126.9996,
        });

        expect(url).toBe("https://map.kakao.com/link/to/Gwangjang%20Market,37.5701,126.9996");
    });

    it("uses Kakao search for Korean area-level records without a usable pin", () => {
        const url = buildSpotDirectionsUrl({
            name: "Haengdang Market Alley",
            address: "Haengdang-dong, Seongdong-gu, Seoul, Korea",
            lat: 0,
            lng: 0,
        });

        expect(url).toBe(
            "https://map.kakao.com/link/search/Haengdang%20Market%20Alley%2C%20Haengdang-dong%2C%20Seongdong-gu%2C%20Seoul%2C%20Korea"
        );
    });
});
