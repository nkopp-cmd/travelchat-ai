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
        "Seocho 2-dong Office Lunch",
        "Yangjae 2-dong Lunch",
        "Seongsoo-dong 1-ga Industry",
        "Euljiro 3-ga Alley Bars",
        "Jongno 3-ga Pojangmacha",
        "Jongno 5-ga Jewelry District",
        "Banpo 4-dong Local Dining",
        "Bangbae 1-dong Cafe Street",
        "Seochon Neighborhood Walk",
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
                photos: ["https://cdn.localley.io/spots/saphan-mai.jpg"],
            })
        ).toBe(true);
    });

    it("does not treat arbitrary remote image URLs as real spot photos", () => {
        expect(
            getPublicSpotQualityIssue({
                name: "Scraped Image Cafe",
                photos: ["https://example.com/cafe.jpg"],
            })
        ).toBe("missing_real_photo");
    });

    it("accepts allowlisted Google-hosted discovery photos", () => {
        expect(
            shouldShowPublicSpot({
                name: "Tiny Noodle House",
                address: { en: "12 Eulji-ro, Seoul" },
                location: { type: "Point", coordinates: [126.978, 37.5665] },
                photos: ["https://lh5.googleusercontent.com/p/photo"],
            })
        ).toBe(true);
    });

    it("hides placeholder and invalid image references from public spot surfaces", () => {
        expect(
            getPublicSpotQualityIssue({
                name: "Nice Looking Placeholder",
                photos: ["/images/placeholders/market.svg"],
            })
        ).toBe("missing_real_photo");

        expect(
            getPublicSpotQualityIssue({
                name: "Broken Photo Spot",
                photos: ["not-a-url"],
            })
        ).toBe("missing_real_photo");

        expect(
            shouldShowPublicSpot({
                name: "Backfilled Google Place",
                photos: ["/api/places/photo?name=places%2Fabc%2Fphotos%2Fdef&w=1200"],
            })
        ).toBe(true);
    });

    it("treats normalizable Google Places media URLs as real public images", () => {
        expect(
            shouldShowPublicSpot({
                name: "Ikseon Tea Room",
                address: { en: "17 Supyo-ro 28-gil, Jongno-gu, Seoul" },
                location: {
                    type: "Point",
                    coordinates: [126.9908, 37.5744],
                },
                photos: [
                    "https://places.googleapis.com/v1/places/ChIJabc123/photos/photo456/media?maxWidthPx=800&key=old",
                ],
                google_place_id: "ChIJabc123",
            })
        ).toBe(true);
    });

    it("hides records whose stored place id conflicts with the proxied place photo", () => {
        expect(
            getPublicSpotQualityIssue({
                name: "Wrong Place Photo",
                address: { en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan" },
                location: {
                    type: "Point",
                    coordinates: [139.7569, 35.6901],
                },
                photos: ["/api/places/photo?name=places%2FChIJ-photo-place%2Fphotos%2Fabc&w=1200"],
                google_place_id: "ChIJ-stored-other",
            })
        ).toBe("mismatched_place_photo_identity");
    });

    it("hides records with area-level addresses when address data is available", () => {
        expect(
            getPublicSpotQualityIssue({
                name: "Gion Corner",
                address: { en: "Gion, Kyoto" },
                location: {
                    type: "Point",
                    coordinates: [135.7788, 35.0037],
                },
                photos: ["https://cdn.localley.io/spots/gion-corner.jpg"],
            })
        ).toBe("inexact_location");

        expect(
            shouldShowPublicSpot({
                name: "Taipei Tea House",
                address: { en: "No. 17, Lane 31, Section 2, Jinshan South Road, Taipei" },
                location: {
                    type: "Point",
                    coordinates: [121.565, 25.033],
                },
                photos: ["https://cdn.localley.io/spots/taipei-tea-house.jpg"],
            })
        ).toBe(true);
    });

    it("allows pinned Google Place photo records for natural places with area-level formatted addresses", () => {
        expect(
            shouldShowPublicSpot({
                name: "Bangameori Beach",
                address: { en: "South Korea, 경기도 안산시 단원구 대부동" },
                location: {
                    type: "Point",
                    coordinates: [126.5765444, 37.289168],
                },
                photos: ["/api/places/photo?name=places%2FChIJCY8opy-gezURl3JHbg7ilyc%2Fphotos%2Fabc&w=1200"],
            })
        ).toBe(true);

        expect(
            getPublicSpotQualityIssue({
                name: "Gion Corner",
                address: { en: "Gion, Kyoto" },
                location: {
                    type: "Point",
                    coordinates: [135.7788, 35.0037],
                },
                photos: ["https://cdn.localley.io/spots/gion-corner.jpg"],
            })
        ).toBe("inexact_location");
    });
});
