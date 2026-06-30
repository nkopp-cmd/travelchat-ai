import { describe, expect, it } from "vitest";
import {
    getPublicSpotQualityIssue,
    shouldShowPublicSpot,
} from "@/lib/spots/public-quality";

describe("public spot quality", () => {
    it.each([
        "Hwagok-dong Residential Area",
        "Macheon-dong Residential",
        "Ayase Working District",
        "Shinjuku Office District",
        "Daebang Station Area",
        "Yukigaya-Otsuka Local",
        "Yeomgok-dong Local Scene",
        "Oji-Kamiya Industrial",
        "Kwun Tong Industrial Area",
        "Bangkok Hidden Day Trip",
        "Seoul Walking Route",
        "Tokyo Bar Crawl",
    ])("hides broad pseudo-spot names: %s", (name) => {
        expect(getPublicSpotQualityIssue({ name })).toBe("broad_place_name");
        expect(shouldShowPublicSpot({ name })).toBe(false);
    });

    it.each([
        "Saphan Mai Market",
        "Guryong Village",
        "Jujo Shopping Street",
        "Haengdang-dong Local Market",
        "Yeongdo Industrial Cafe",
        "200 Xom Chieu Street Food Alley",
        "Kitakagaya Street Art",
    ])("keeps named public places for deeper location review: %s", (name) => {
        expect(getPublicSpotQualityIssue({ name })).toBeNull();
        expect(shouldShowPublicSpot({ name })).toBe(true);
    });

    it("supports localized Supabase fields", () => {
        expect(
            shouldShowPublicSpot({
                name: { en: "Okusawa Residential", ko: "오쿠사와" },
            })
        ).toBe(false);
    });

    it("hides spots with no stored photo references when photos are available to check", () => {
        expect(
            getPublicSpotQualityIssue({
                name: "Temple Courtyard Gardens",
                photos: null,
            })
        ).toBe("missing_real_photo");

        expect(
            shouldShowPublicSpot({
                name: "Temple Courtyard Gardens",
                photos: [],
            })
        ).toBe(false);

        expect(
            shouldShowPublicSpot({
                name: "Saphan Mai Market",
                photos: ["https://example.com/saphan-mai.jpg"],
            })
        ).toBe(true);
    });
});
