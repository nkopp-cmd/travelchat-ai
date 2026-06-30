import { describe, expect, it } from "vitest";
import { getPlacePhotoMatchQuality } from "@/lib/place-images";

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
});
