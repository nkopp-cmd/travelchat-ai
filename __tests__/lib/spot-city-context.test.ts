import { describe, expect, it } from "vitest";
import { inferSpotContextCity } from "@/lib/spots/city-context";

describe("spot city context", () => {
    it("infers a city from explicit city names in spot text", () => {
        expect(
            inferSpotContextCity({
                name: "Yilan National Center for Traditional Arts",
                address: "201 Wubin Road Sec 2, Wujie Township, Yilan",
            })
        ).toBe("Yilan");

        expect(
            inferSpotContextCity({
                name: "Brave Aquarium",
                address: "367 Beining Road, Zhongzheng District, Keelung",
            })
        ).toBe("Keelung");
    });

    it("infers a city from known local terms when city text is absent", () => {
        expect(
            inferSpotContextCity({
                name: "Coastal craft stop",
                address: "Wujie Township",
            })
        ).toBe("Yilan");

        expect(
            inferSpotContextCity({
                name: "Harbor food walk",
                address: "Miaokou night market",
            })
        ).toBe("Keelung");
    });

    it("infers a city from coordinate ranges as a fallback", () => {
        expect(
            inferSpotContextCity({
                name: "Pinned Yilan stop",
                address: "",
                lat: 24.685587,
                lng: 121.824053,
            })
        ).toBe("Yilan");
    });

    it("returns null for unknown text and unusable coordinates", () => {
        expect(
            inferSpotContextCity({
                name: "Unknown place",
                address: "Somewhere",
                lat: 0,
                lng: 0,
            })
        ).toBeNull();
    });
});
