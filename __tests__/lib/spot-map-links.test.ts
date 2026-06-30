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
                address: "Jalan Hang Lekir, Kuala Lumpur",
                googlePlaceId: "ChIJ-test-place",
            })
        );

        expect(url.searchParams.get("destination")).toBe(
            "Popiah Cart, Jalan Hang Lekir, Kuala Lumpur"
        );
        expect(url.searchParams.get("destination_place_id")).toBe("ChIJ-test-place");
    });

    it("uses Kakao search for Korean locations", () => {
        const url = buildSpotDirectionsUrl({
            name: "Gwangjang Market",
            address: "Jongno-gu, Seoul, Korea",
            lat: 37.5701,
            lng: 126.9996,
        });

        expect(isKoreanLocation("Jongno-gu, Seoul, Korea")).toBe(true);
        expect(url).toBe(
            "https://map.kakao.com/link/search/Gwangjang%20Market%2C%20Jongno-gu%2C%20Seoul%2C%20Korea"
        );
    });
});
