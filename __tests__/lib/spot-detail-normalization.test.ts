import { describe, expect, it } from "vitest";
import { LocalleyScale } from "@/types";
import {
    getSpotBestTime,
    getSpotCoordinateEvidenceLabel,
    getSpotDirectionsButtonLabel,
    getSpotPhotoEvidenceHelper,
    getSpotPhotoEvidenceLabel,
    normalizeLocalleyScore,
    normalizeLocalPercentage,
    normalizeSpotTips,
} from "@/lib/spots/detail-normalization";

describe("spot detail normalization", () => {
    it("reads tips from array and localized object shapes", () => {
        expect(normalizeSpotTips([" Bring cash ", "", "Go early"])).toEqual([
            "Bring cash",
            "Go early",
        ]);

        expect(normalizeSpotTips({ en: [" Try the corner stall ", "Cash only"] })).toEqual([
            "Try the corner stall",
            "Cash only",
        ]);

        expect(normalizeSpotTips({ ko: ["현금 준비"], ja: "" })).toEqual(["현금 준비"]);
    });

    it("reads best time from localized and legacy fields", () => {
        expect(getSpotBestTime({ en: "Weekday evenings", ko: "평일 저녁" }, "Late night")).toBe(
            "Weekday evenings"
        );
        expect(getSpotBestTime(null, "Late night")).toBe("Late night");
        expect(getSpotBestTime(null, null)).toBe("Anytime");
    });

    it("keeps score and local percentage inside presentable ranges", () => {
        expect(normalizeLocalleyScore(null)).toBe(LocalleyScale.MIXED_CROWD);
        expect(normalizeLocalleyScore(9)).toBe(LocalleyScale.LEGENDARY_ALLEY);
        expect(normalizeLocalleyScore(0)).toBe(LocalleyScale.TOURIST_TRAP);

        expect(normalizeLocalPercentage(null)).toBe(50);
        expect(normalizeLocalPercentage(117)).toBe(100);
        expect(normalizeLocalPercentage(-10)).toBe(0);
    });

    it("labels Korean pinned directions as routing to the saved pin", () => {
        expect(getSpotDirectionsButtonLabel("exact", true)).toBe("Open exact spot in Kakao");
        expect(getSpotDirectionsButtonLabel("pinned", true)).toBe("Route to saved pin in Kakao");
        expect(getSpotDirectionsButtonLabel("pinned", false)).toBe("Route to saved pin");
        expect(getSpotDirectionsButtonLabel("area", true)).toBe("Search name in Kakao");
    });

    it("describes real image evidence without calling fallbacks spot photos", () => {
        expect(
            getSpotPhotoEvidenceLabel({
                hasRealPhoto: true,
                realPhotoCount: 2,
                googlePlaceId: "ChIJ123",
            })
        ).toBe("2 place photo sources");
        expect(
            getSpotPhotoEvidenceHelper({
                hasRealPhoto: true,
                realPhotoCount: 1,
                googlePlaceId: null,
            })
        ).toBe("Uses stored real imagery rather than a category placeholder.");
        expect(
            getSpotPhotoEvidenceLabel({
                hasRealPhoto: false,
                realPhotoCount: 0,
                googlePlaceId: null,
            })
        ).toBe("Image fallback");
        expect(
            getSpotPhotoEvidenceHelper({
                hasRealPhoto: false,
                realPhotoCount: 0,
                googlePlaceId: null,
            })
        ).toBe("Showing a city fallback until a verified spot photo is backfilled.");
    });

    it("labels Korean coordinates as saved Kakao route pins", () => {
        expect(
            getSpotCoordinateEvidenceLabel({
                address: "Seoul, South Korea",
                tone: "pinned",
                usableCoordinates: true,
            })
        ).toBe("Saved Kakao route pin");
        expect(
            getSpotCoordinateEvidenceLabel({
                address: "123 Main Street, New York, USA",
                tone: "exact",
                usableCoordinates: true,
            })
        ).toBe("Exact map coordinate");
        expect(
            getSpotCoordinateEvidenceLabel({
                address: "Creative district",
                tone: "area",
                usableCoordinates: false,
            })
        ).toBe("Imported coordinate");
    });
});
