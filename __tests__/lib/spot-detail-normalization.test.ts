import { describe, expect, it } from "vitest";
import { LocalleyScale } from "@/types";
import {
    getSpotBestTime,
    getSpotCoordinateEvidenceLabel,
    getSpotDirectionsButtonLabel,
    getSpotNavigationMode,
    getSpotPhotoEvidenceHelper,
    getSpotPhotoEvidenceLabel,
    getTrustedSpotGooglePlaceId,
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

    it("labels pinned directions as search-first until the address is exact", () => {
        expect(getSpotDirectionsButtonLabel("exact", true)).toBe("Search exact spot in Kakao");
        expect(getSpotDirectionsButtonLabel("exact", false)).toBe("Search exact spot in Maps");
        expect(getSpotDirectionsButtonLabel("exact", false, true)).toBe("Get exact directions");
        expect(getSpotDirectionsButtonLabel("pinned", true)).toBe("Search area in Kakao");
        expect(getSpotDirectionsButtonLabel("pinned", false)).toBe("Search name in Maps");
        expect(getSpotDirectionsButtonLabel("pinned", false, true)).toBe("Get exact directions");
        expect(getSpotDirectionsButtonLabel("area", true)).toBe("Search name in Kakao");
        expect(getSpotDirectionsButtonLabel("area", false)).toBe("Search area in Maps");
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
        ).toBe("No verified coordinate");
    });

    it("describes navigation modes for exact and search-first direction targets", () => {
        expect(
            getSpotNavigationMode({
                tone: "area",
                isKorea: false,
                hasMatchedGooglePlace: true,
                usableCoordinates: true,
            })
        ).toMatchObject({
            status: "exact_place_id",
            label: "Exact Place ID",
            targetLabel: "Map target",
        });

        expect(
            getSpotNavigationMode({
                tone: "exact",
                isKorea: true,
                hasMatchedGooglePlace: false,
                usableCoordinates: true,
            })
        ).toMatchObject({
            status: "exact_address_search",
            label: "Exact Kakao search",
            targetLabel: "Map target",
        });

        expect(
            getSpotNavigationMode({
                tone: "pinned",
                isKorea: false,
                hasMatchedGooglePlace: false,
                usableCoordinates: true,
            })
        ).toMatchObject({
            status: "search_first_pin",
            label: "Pinned Maps search",
            targetLabel: "Search target",
        });

        expect(
            getSpotNavigationMode({
                tone: "area",
                isKorea: true,
                hasMatchedGooglePlace: false,
                usableCoordinates: false,
            })
        ).toMatchObject({
            status: "search_first_area",
            label: "Area Kakao search",
            targetLabel: "Search target",
        });
    });

    it("only trusts a stored Google Place ID when place-photo identity does not conflict", () => {
        expect(
            getTrustedSpotGooglePlaceId({
                photos: ["/api/places/photo?name=places%2FChIJ-photo-place%2Fphotos%2Fabc&w=1200"],
                storedGooglePlaceId: "ChIJ-photo-place",
            })
        ).toBe("ChIJ-photo-place");

        expect(
            getTrustedSpotGooglePlaceId({
                photos: ["/api/places/photo?name=places%2FChIJ-photo-place%2Fphotos%2Fabc&w=1200"],
                storedGooglePlaceId: "ChIJ-stored-other",
            })
        ).toBeNull();

        expect(
            getTrustedSpotGooglePlaceId({
                photos: ["/api/places/photo?name=places%2FChIJ-photo-place%2Fphotos%2Fabc&w=1200"],
            })
        ).toBe("ChIJ-photo-place");
    });
});
