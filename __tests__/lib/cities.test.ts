import { describe, expect, it } from "vitest";
import { hasCityImage } from "@/lib/city-images";
import { getCityByName, getCityBySlug, inferCityFromAddress } from "@/lib/cities";

describe("city registry", () => {
    it("recognizes Taiwan depth cities used by spot location enrichment", () => {
        expect(getCityBySlug("keelung")).toMatchObject({
            name: "Keelung",
            countryCode: "TW",
            timezone: "Asia/Taipei",
        });
        expect(getCityByName("Yilan")).toMatchObject({
            slug: "yilan",
            countryCode: "TW",
            timezone: "Asia/Taipei",
        });
    });

    it("infers Keelung and Yilan from exact production spot addresses", () => {
        expect(
            inferCityFromAddress("367 Beining Road, Zhongzheng District, Keelung")
        )?.toMatchObject({ slug: "keelung" });

        expect(
            inferCityFromAddress("201 Wubin Road Sec 2, Wujie Township, Yilan")
        )?.toMatchObject({ slug: "yilan" });
    });

    it("has related city-image fallbacks for Taiwan depth cities", () => {
        expect(hasCityImage("Keelung")).toBe(true);
        expect(hasCityImage("Yilan")).toBe(true);
    });
});
