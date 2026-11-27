import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BookableCard, CityTourCards, formatFromPrice, viatorToBookable } from "@/components/booking/bookable-card";

const base = {
    id: "p1",
    productCode: "12345P1",
    title: "Gwangjang Market night food tour",
    thumbnailUrl: "https://hare-media-cdn.tripadvisor.com/media/a-720.jpg",
    priceFrom: 69,
    currency: "USD",
    rating: 4.8,
    reviewCount: 812,
    duration: "3 hours",
    freeCancellation: true,
    viatorUrl: "https://www.viator.com/tours/Seoul/Night-food/d973-12345P1?pid=P00012345",
};

describe("BookableCard", () => {
    it("is one sponsored link to the partner page with real rating, price and free cancellation", () => {
        const item = viatorToBookable(base)!;
        render(<BookableCard item={item} placement="spot" />);
        const link = screen.getByRole("link");
        expect(link.getAttribute("href")).toBe(base.viatorUrl);
        expect(link.getAttribute("rel")).toContain("sponsored");
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.textContent).toContain("4.8");
        expect(link.textContent).toContain("(812 reviews)");
        expect(link.textContent).toContain("$69");
        expect(link.textContent).toContain("Free cancellation");
        expect(link.textContent).toContain("Check availability");
    });

    it("hides the rating when the partner has no reviews", () => {
        const item = viatorToBookable({ ...base, rating: 4.5, reviewCount: 0 })!;
        render(<BookableCard item={item} placement="itinerary" />);
        expect(screen.getByRole("link").textContent).not.toContain("reviews");
        expect(screen.getByRole("link").textContent).not.toContain("4.5");
    });

    it("makes no card without a viator.com partner URL", () => {
        expect(viatorToBookable({ ...base, viatorUrl: undefined, bookingUrl: undefined })).toBeNull();
        expect(viatorToBookable({ ...base, viatorUrl: "https://example.com/tour" })).toBeNull();
        expect(viatorToBookable({ ...base, title: "" })).toBeNull();
    });

    it("shows only city tours with a complete affiliate link", () => {
        const affiliateUrl = `${base.viatorUrl}&mcid=42383`;
        render(<CityTourCards city="Seoul" activities={[base, { ...base, viatorUrl: affiliateUrl }]} />);
        expect(screen.getByRole("heading", { name: "Tours in Seoul" })).toBeTruthy();
        expect(screen.getByRole("link").getAttribute("href")).toBe(affiliateUrl);
    });

    it("shows no price for zero or missing amounts", () => {
        expect(formatFromPrice(0)).toBeNull();
        expect(formatFromPrice(undefined)).toBeNull();
        expect(formatFromPrice(69, "USD")).toBe("$69");
    });
});
