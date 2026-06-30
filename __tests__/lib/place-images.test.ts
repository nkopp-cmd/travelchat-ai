import { describe, expect, it, vi } from "vitest";
import {
    classifySpotPhoto,
    findBestGooglePlacePhotos,
    getGooglePlaceIdFromPhotoUrl,
    getGooglePlaceIdFromSpotPhotos,
    getProxiedGooglePhotoUrl,
    getPlacePhotoMatchQuality,
    needsSpotPhotoBackfill,
    normalizeStoredSpotPhotoUrls,
    summarizeSpotPhotos,
} from "@/lib/place-images";

describe("spot photo classification", () => {
    it("treats proxied Google Places photos as real backfilled images", () => {
        const photo = "/api/places/photo?w=1200&v=2&name=places%2Fabc%2Fphotos%2Fdef";

        expect(classifySpotPhoto(photo)).toBe("proxy");
        expect(needsSpotPhotoBackfill([photo])).toBe(false);
    });

    it("rejects placeholder, unsplash, direct google, empty, and invalid photos", () => {
        const photos = [
            "/images/placeholder-spot.jpg",
            "https://images.unsplash.com/photo-123",
            "https://places.googleapis.com/v1/places/abc/photos/def/media",
            "",
            "not a url",
        ];

        expect(photos.map((photo) => classifySpotPhoto(photo))).toEqual([
            "placeholder",
            "unsplash",
            "direct_google",
            "empty",
            "invalid",
        ]);
        expect(needsSpotPhotoBackfill(photos)).toBe(true);
    });

    it("summarizes mixed photo arrays and only requires one real image", () => {
        const summary = summarizeSpotPhotos([
            "/images/placeholder-spot.jpg",
            "/images/spots/seoul-market.jpg",
            "https://cdn.localley.io/spots/seoul-market.jpg",
        ]);

        expect(summary).toMatchObject({
            total: 3,
            hasAnyPhoto: true,
            hasRealPhoto: true,
            needsBackfill: false,
            primaryKind: "placeholder",
        });
        expect(summary.kinds.local_asset).toBe(1);
        expect(summary.kinds.remote_https).toBe(1);
    });

    it("converts stored direct Google photo URLs to Localley proxy URLs", () => {
        expect(
            getProxiedGooglePhotoUrl(
                "https://places.googleapis.com/v1/places/abc/photos/def/media?maxWidthPx=800&key=old"
            )
        ).toBe("/api/places/photo?w=1200&v=2&name=places%2Fabc%2Fphotos%2Fdef");

        expect(
            getProxiedGooglePhotoUrl(
                "https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=legacy_ref&key=old"
            )
        ).toBe("/api/places/photo?w=1200&v=2&ref=legacy_ref");
    });

    it("normalizes only convertible stored photo URLs", () => {
        expect(
            normalizeStoredSpotPhotoUrls([
                "https://places.googleapis.com/v1/places/abc/photos/def/media?key=old",
                "https://cdn.example.com/spot.jpg",
            ])
        ).toEqual([
            "/api/places/photo?w=1200&v=2&name=places%2Fabc%2Fphotos%2Fdef",
            "https://cdn.example.com/spot.jpg",
        ]);
    });

    it("adds the current cache-busting version to stored proxy URLs", () => {
        expect(
            normalizeStoredSpotPhotoUrls([
                "/api/places/photo?w=1200&name=places%2Fabc%2Fphotos%2Fdef",
            ])
        ).toEqual([
            "/api/places/photo?w=1200&v=2&name=places%2Fabc%2Fphotos%2Fdef",
        ]);
    });

    it("extracts Google Place IDs from proxied and direct Places photo URLs", () => {
        expect(
            getGooglePlaceIdFromPhotoUrl(
                "/api/places/photo?w=1200&name=places%2FChIJabc123%2Fphotos%2Fphoto456"
            )
        ).toBe("ChIJabc123");

        expect(
            getGooglePlaceIdFromPhotoUrl(
                "https://places.googleapis.com/v1/places/ChIJxyz789/photos/photo123/media?maxWidthPx=1200"
            )
        ).toBe("ChIJxyz789");

        expect(
            getGooglePlaceIdFromSpotPhotos([
                "https://cdn.example.com/spot.jpg",
                "/api/places/photo?w=1200&name=places%2FChIJsecond%2Fphotos%2Fphoto456",
            ])
        ).toBe("ChIJsecond");

        expect(getGooglePlaceIdFromPhotoUrl("/api/places/photo?ref=legacy_ref")).toBeNull();
    });
});

describe("findBestGooglePlacePhotos", () => {
    it("checks later Google Places results when the first result is not acceptable", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({
                    places: [
                        {
                            id: "wrong-place",
                            displayName: { text: "People Park Food Centre" },
                            formattedAddress: "Kuala Lumpur, Malaysia",
                            types: ["restaurant"],
                            photos: [{ name: "places/wrong/photos/one" }],
                        },
                        {
                            id: "right-place",
                            displayName: { text: "People's Park Complex" },
                            formattedAddress: "1 Park Road, Singapore 059108",
                            types: ["shopping_mall"],
                            photos: [{ name: "places/right/photos/one" }],
                        },
                    ],
                }),
                { status: 200 }
            )
        );

        const match = await findBestGooglePlacePhotos(
            "People's Park Complex",
            "1 Park Road, Singapore",
            "Shopping",
            "test-api-key"
        );

        expect(match.place?.placeId).toBe("right-place");
        expect(match.place?.photos).toHaveLength(1);
        expect(match.quality?.acceptable).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fetchMock.mockRestore();
    });
});

describe("getPlacePhotoMatchQuality", () => {
    it("rejects address-only matches for unrelated place names", () => {
        const quality = getPlacePhotoMatchQuality(
            "Fit&Fun Zone at Changi Airport",
            "60 Airport Blvd., Singapore 819643",
            "Outdoor",
            {
                displayName: "Ambassador Transit Hotel - Terminal 2",
                formattedAddress: "60 Airport Blvd., Singapore 819643",
                types: ["lodging"],
            }
        );

        expect(quality.acceptable).toBe(false);
    });

    it("rejects a one-word street match when Google returns a hotel", () => {
        const quality = getPlacePhotoMatchQuality(
            "Samsen Street",
            "Samsen Road, Bangkok",
            "Food",
            {
                displayName: "Samsen street hotel",
                formattedAddress:
                    "66 Thanon Samsen, Khwaeng Ban Phan Thom, Khet Phra Nakhon, Bangkok 10200, Thailand",
                types: ["lodging"],
            }
        );

        expect(quality.acceptable).toBe(false);
    });

    it("rejects same-name places in the wrong country", () => {
        const quality = getPlacePhotoMatchQuality(
            "Rang Mahal Indian",
            "Rembrandt Hotel, Bangkok",
            "Food",
            {
                displayName: "Rang Mahal Restaurant & Bar | Best Indian Restaurant in Singapore",
                formattedAddress: "41 Seah St, Level 1 Naumi Hotel, Singapore 188396",
                types: ["restaurant"],
            }
        );

        expect(quality.acceptable).toBe(false);
    });

    it("rejects a matching area name when the returned address is a different city", () => {
        const quality = getPlacePhotoMatchQuality(
            "Sakuragawa",
            "Sakuragawa, Naniwa-ku, Osaka",
            "Culture",
            {
                displayName: "Sakuragawa",
                formattedAddress: "Sakuragawa, Ibaraki, Japan",
                types: ["neighborhood"],
            }
        );

        expect(quality.acceptable).toBe(false);
        expect(quality.reason).toBe("missing_location_anchor_match");
    });

    it("rejects a specific retail business for a broader culture area", () => {
        const quality = getPlacePhotoMatchQuality(
            "Tama New Town",
            "Tama New Town, Tokyo",
            "Culture",
            {
                displayName: "Nitori Tama New Town shop",
                formattedAddress: "2 Chome Bessho, Hachioji, Tokyo 192-0363, Japan",
                types: ["furniture_store", "home_goods_store", "store"],
            }
        );

        expect(quality.acceptable).toBe(false);
        expect(quality.reason).toBe("specific_business_for_broader_spot");
    });

    it("rejects station-named matches for non-transportation spots", () => {
        const quality = getPlacePhotoMatchQuality(
            "MRT Thai Cultural Centre",
            "Ratchadaphisek Road, Bangkok",
            "Culture",
            {
                displayName: "MRT Station Thailand Cultural Center (Exit 1)",
                formattedAddress: "QH8C+RGC, Huai Khwang, Bangkok 10310, Thailand",
                types: ["point_of_interest"],
            }
        );

        expect(quality.acceptable).toBe(false);
        expect(quality.reason).toBe("transit_named_place_for_non_transit_spot");
    });

    it("rejects partial name matches without a strong address match", () => {
        const quality = getPlacePhotoMatchQuality(
            "Bogwang-dong International",
            "Bogwang-dong, Yongsan-gu, Seoul",
            "Food",
            {
                displayName: "International World in Korea",
                formattedAddress: "South Korea, Seoul, Yongsan District, Duteopbawi-ro, 59-1 D-70",
                types: ["point_of_interest"],
            }
        );

        expect(quality.acceptable).toBe(false);
        expect(quality.reason).toBe("partial_name_without_strong_address_match");
    });

    it("rejects a generated office district when Google only returns the base neighborhood", () => {
        const quality = getPlacePhotoMatchQuality(
            "Sogong-dong Office District",
            "Sogong-dong, Jung-gu, Seoul",
            "Food",
            {
                displayName: "Sogong-dong",
                formattedAddress: "Sogong-dong, Jung District, Seoul, South Korea",
                types: ["sublocality", "political"],
            }
        );

        expect(quality.acceptable).toBe(false);
        expect(quality.reason).toBe("missing_broad_spot_qualifier");
    });

    it("rejects a residential spot when Google only returns the base neighborhood", () => {
        const quality = getPlacePhotoMatchQuality(
            "Jamwon-dong Residential",
            "Jamwon-dong, Seocho-gu, Seoul",
            "Food",
            {
                displayName: "Jamwon-dong",
                formattedAddress: "Jamwon-dong, Seocho District, Seoul, South Korea",
                types: ["sublocality", "political"],
            }
        );

        expect(quality.acceptable).toBe(false);
        expect(quality.reason).toBe("missing_broad_spot_qualifier");
    });

    it("accepts exact place names with matching location signal", () => {
        const quality = getPlacePhotoMatchQuality(
            "People's Park Complex",
            "1 Park Road, Singapore",
            "Shopping",
            {
                displayName: "People's Park Complex",
                formattedAddress: "1 Park Road, Singapore 059108",
                types: ["shopping_mall"],
            }
        );

        expect(quality.acceptable).toBe(true);
    });

    it("accepts area matches when the name and address agree", () => {
        const quality = getPlacePhotoMatchQuality(
            "Nakazakicho",
            "1 Chome-5 Nakazaki, Kita Ward, Osaka, 530-0016, Japan",
            "Outdoor",
            {
                displayName: "Nakazakicho",
                formattedAddress:
                    "1-chome-1-15 Nakazakinishi, Kita Ward, Osaka, 530-0015, Japan",
                types: ["neighborhood"],
            }
        );

        expect(quality.acceptable).toBe(true);
    });

    it("allows address-only matches when the returned place name has no comparable latin words", () => {
        const quality = getPlacePhotoMatchQuality(
            "Elephant Mountain",
            "Xinyi District, Taipei City, Taiwan 110",
            "Outdoor",
            {
                displayName: "象山",
                formattedAddress: "Xinyi District, Taipei City, Taiwan 110",
                types: ["tourist_attraction"],
            }
        );

        expect(quality.acceptable).toBe(true);
    });

    it("accepts non-latin official place names with a strong address match", () => {
        const quality = getPlacePhotoMatchQuality(
            "Setagaya Boroichi Flea Market",
            "Setagaya, Setagaya-ku, Tokyo",
            "Market",
            {
                displayName: "世田谷ボロ市",
                formattedAddress: "1-chōme-23-1 Setagaya, Setagaya City, Tokyo 154-0017, Japan",
                types: ["tourist_attraction", "market"],
            }
        );

        expect(quality).toMatchObject({
            acceptable: true,
            reason: "accepted",
        });
    });
});
