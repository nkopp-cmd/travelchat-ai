import { describe, expect, it } from "vitest";
import { hasCityImage } from "@/lib/city-images";
import { getCityByName, getCityBySlug, inferCityFromAddress, spotCityCandidates } from "@/lib/cities";

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

describe("spotCityCandidates", () => {
    it("adds the stored city when the address text names none", () => {
        expect(inferCityFromAddress("Tung Choi Street, Mong Kok, Kowloon")).toBeUndefined();
        expect(spotCityCandidates("Hong Kong", "Tung Choi Street, Mong Kok, Kowloon").map(c => c.slug)).toEqual(["hong-kong"]);
        expect(spotCityCandidates("Ho Chi Minh City", "Cô Giang, Quận 1, Thành phố Hồ Chí Minh, Vietnam").map(c => c.name)).toEqual(["Ho Chi Minh City"]);
    });
    it("keeps both cities when they differ, once when they agree, none when unknown", () => {
        expect(spotCityCandidates("Hanoi", "18 Hanoi Road, Tsim Sha Tsui, Kowloon").map(c => c.name)).toEqual(["Hanoi"]);
        expect(spotCityCandidates("Tokyo", "Gangnam-gu, Seoul").map(c => c.name)).toEqual(["Tokyo", "Seoul"]);
        expect(spotCityCandidates(null, "somewhere")).toEqual([]);
        expect(spotCityCandidates("Atlantis", "")).toEqual([]);
    });
});
