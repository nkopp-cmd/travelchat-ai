import { describe, expect, it } from "vitest";
import {
    inferSpotContextCity,
    inferSpotContextCitySlug,
} from "@/lib/spots/city-context";

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

    it("returns registry slugs for inferred cities used in links", () => {
        expect(
            inferSpotContextCitySlug({
                name: "Hidden Seoul bar",
                address: "Euljiro, Seoul, South Korea",
            })
        ).toBe("seoul");

        expect(
            inferSpotContextCitySlug({
                name: "Harbor food walk",
                address: "Miaokou night market",
            })
        ).toBe("keelung");

        expect(
            inferSpotContextCitySlug({
                name: "Unknown place",
                address: "Somewhere",
            })
        ).toBeNull();
    });
});
