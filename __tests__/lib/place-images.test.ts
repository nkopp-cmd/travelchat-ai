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
