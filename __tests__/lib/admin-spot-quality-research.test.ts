import { describe, expect, it } from "vitest";
import {
    buildSpotResearchLinks,
    buildSpotResearchQuery,
    getSpotResearchFocus,
} from "@/lib/admin/spot-quality-research";

describe("admin spot quality research helpers", () => {
    it("builds a deduped place research query from name, address, and category", () => {
        expect(
            buildSpotResearchQuery({
                name: "  Okusawa Residential  ",
                address: "Okusawa, Tokyo",
                category: "Local spot",
                lat: null,
                lng: null,
                issues: ["missing_real_photo", "inexact_location"],
            })
        ).toBe("Okusawa Residential Okusawa, Tokyo Local spot");

        expect(
            buildSpotResearchQuery({
                name: "Gion, Kyoto",
                address: "Gion, Kyoto",
                category: null,
                lat: null,
                lng: null,
                issues: ["inexact_location"],
            })
        ).toBe("Gion, Kyoto");
    });

    it("returns operator search links and coordinate text", () => {
        const links = buildSpotResearchLinks({
            name: "Ladrio",
            address: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo",
            category: "Cafe",
            lat: 35.695,
            lng: 139.758,
            googlePlaceId: "ChIJ-ladrio",
            issues: ["missing_place_id"],
        });

        expect(links.query).toBe("Ladrio 1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo Cafe");
        expect(links.mapsUrl).toContain("https://www.google.com/maps/search/");
        expect(links.mapsUrl).toContain("Ladrio%201-chome-3-3");
        expect(links.directionsUrl).toContain("https://www.google.com/maps/dir/");
        expect(links.directionsUrl).toContain("destination_place_id=ChIJ-ladrio");
        expect(links.imageSearchUrl).toContain("tbm=isch");
        expect(links.placeIdSearchUrl).toContain("place-id");
        expect(links.coordinateText).toBe("35.6950000, 139.7580000");
    });

    it("prioritizes exact place research when image and location are both weak", () => {
        expect(getSpotResearchFocus(["missing_real_photo", "inexact_location"])).toContain(
            "exact business/place"
        );
        expect(getSpotResearchFocus(["missing_place_id"])).toContain("Supabase column migration");
        expect(getSpotResearchFocus(["mismatched_place_photo_identity"])).toContain("Reconcile");
        expect(getSpotResearchFocus([])).toContain("Confirm");
    });
});
