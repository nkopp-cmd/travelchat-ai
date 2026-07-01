import { describe, expect, it } from "vitest";
import { LocalleyScale } from "@/types";
import {
    getSpotBestTime,
    getSpotCoordinateEvidenceLabel,
    getSpotDirectionsButtonLabel,
    getSpotNavigationMode,
    getSpotNavigationTargetValue,
    getSpotPhotoEvidenceHelper,
    getSpotPhotoEvidenceLabel,
    getSpotRecordConfidence,
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
        expect(getSpotDirectionsButtonLabel("exact", false)).toBe("Get exact directions");
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

    it("shows coordinate route targets only when directions actually route to coordinates", () => {
        expect(
            getSpotNavigationTargetValue({
                status: "exact_coordinate_directions",
                fallbackQuery: "LADRIO, 1-chome-3-3 Kanda Jinbocho, Tokyo",
                lat: 35.695123,
                lng: 139.758456,
            })
        ).toBe("35.69512, 139.75846");

        expect(
            getSpotNavigationTargetValue({
                status: "search_first_pin",
                fallbackQuery: "Gion Coffee, Gion, Kyoto",
                lat: 35.0037,
                lng: 135.7788,
            })
        ).toBe("Gion Coffee, Gion, Kyoto");
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

    it("summarizes record confidence for detail page trust signals", () => {
        expect(
            getSpotRecordConfidence({
                hasRealPhoto: true,
                realPhotoCount: 3,
                locationTone: "area",
                hasTrustedGooglePlaceId: true,
                verified: true,
            })
        ).toMatchObject({
            label: "Verified route-ready record",
            tone: "emerald",
            checks: [
                { label: "Image", value: "3 real photos", ready: true },
                { label: "Map target", value: "Place matched", ready: true },
                { label: "Curation", value: "Verified", ready: true },
            ],
        });

        expect(
            getSpotRecordConfidence({
                hasRealPhoto: true,
                realPhotoCount: 1,
                locationTone: "pinned",
                hasTrustedGooglePlaceId: false,
                verified: false,
            })
        ).toMatchObject({
            label: "Image-ready, route needs review",
            tone: "amber",
            checks: [
                { label: "Image", value: "1 real photo", ready: true },
                { label: "Map target", value: "Pinned area", ready: false },
                { label: "Curation", value: "Curated", ready: true },
            ],
        });

        expect(
            getSpotRecordConfidence({
                hasRealPhoto: false,
                realPhotoCount: 0,
                locationTone: "area",
                hasTrustedGooglePlaceId: false,
                verified: false,
            })
        ).toMatchObject({
            label: "Needs photo and route review",
            tone: "amber",
            checks: [
                { label: "Image", value: "Needs photo", ready: false },
                { label: "Map target", value: "Area search", ready: false },
                { label: "Curation", value: "Curated", ready: true },
            ],
        });
    });
});
