import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
    BUDGET_PRICE_CAP_USD,
    isFreeStop,
    matchDay,
    matchStop,
    parseCostAmount,
    type MatchableProduct,
    type TripBudget,
} from "@/lib/booking/match";

const p = (productCode: string, title: string, priceFrom: number, rating = 4.7, reviewCount = 500): MatchableProduct => ({
    productCode, title, priceFrom, currency: "USD", rating, reviewCount,
});

const products = [
    p("FOOD1", "Gwangjang Market night food tour with local guide", 69),
    p("FOOD2", "Korean BBQ and soju night food tour", 85, 4.9, 1200),
    p("PAL1", "Gyeongbokgung Palace hanbok rental and guided walk", 35),
    p("LUX1", "Private Seoul food tour by luxury car", 450),
    p("TEAM1", "teamLab Planets Tokyo admission ticket", 28),
];

describe("booking matching (plan B4)", () => {
    it("never shows a card on a free stop", () => {
        expect(matchStop({ name: "Bukchon Hanok Village", category: "neighborhood" }, products)).toBeNull();
        expect(matchStop({ name: "Gwangjang Market", category: "market", cost: "Free" }, products)).toBeNull();
        expect(matchStop({ name: "Namsan Park", category: "park", cost: "$0" }, products)).toBeNull();
    });

    it("prefers the product that names the stop over a generic category fit", () => {
        const match = matchStop({ name: "Gwangjang Market", category: "market", cost: "$10-15" }, products);
        expect(match?.productCode).toBe("FOOD1");
        const ticket = matchStop({ name: "teamLab Planets", category: "attraction", cost: "¥3,800" }, products);
        expect(ticket?.productCode).toBe("TEAM1");
    });

    it("does not name-match on generic nouns like 'palace'", () => {
        const match = matchStop({ name: "Changdeokgung Palace", category: "museum", cost: "$3" }, [p("PAL1", "Gyeongbokgung Palace hanbok rental", 35)]);
        expect(match).toBeNull();
    });

    it("respects the budget band", () => {
        const stop = { name: "Dinner in Mapo", category: "restaurant", cost: "$20" };
        expect(matchStop(stop, [products[3]], "budget")).toBeNull();
        expect(matchStop(stop, [products[3]], "luxury")?.productCode).toBe("LUX1");
    });

    it("never shows the same product twice in one day", () => {
        const day = matchDay(
            [
                { name: "Lunch at Myeongdong", category: "restaurant", cost: "$12" },
                { name: "Dinner at Hongdae", category: "restaurant", cost: "$25" },
                { name: "Late snack", category: "restaurant", cost: "$8" },
            ],
            [products[0], products[1]],
        );
        const codes = day.filter(Boolean).map((m) => m!.productCode);
        expect(new Set(codes).size).toBe(codes.length);
        expect(day[2]).toBeNull();
    });

    it("parses cost strings", () => {
        expect(parseCostAmount("$8-15")).toBe(8);
        expect(parseCostAmount("₩15,000")).toBe(15000);
        expect(parseCostAmount("Varies")).toBeNull();
        expect(isFreeStop({ cost: "free entry" })).toBe(true);
    });

    // Invariants: free stop -> no card; a match is always inside the band; no product repeats in a day.
    it("property: matches stay inside the budget cap and never repeat", () => {
        const budgetArb = fc.constantFrom<TripBudget>("budget", "cheap", "moderate", "luxury", "splurge");
        const productArb = fc.record({
            productCode: fc.stringMatching(/^[A-Z0-9]{3,6}$/),
            title: fc.constantFrom("food tour", "cooking class", "palace walk", "bar crawl", "museum ticket", "market tour"),
            priceFrom: fc.integer({ min: 1, max: 600 }),
            currency: fc.constant("USD"),
            rating: fc.double({ min: 0, max: 5, noNaN: true }),
            reviewCount: fc.integer({ min: 0, max: 5000 }),
        });
        const stopArb = fc.record({
            name: fc.constantFrom("Gwangjang Market", "Dinner", "Palace visit", "Night out", "Museum"),
            category: fc.constantFrom("restaurant", "market", "temple", "bar", "museum", "park", "neighborhood"),
            cost: fc.constantFrom("Free", "$0", "$10", "$8-15", "Varies", undefined),
        });
        fc.assert(
            fc.property(fc.array(stopArb, { maxLength: 8 }), fc.array(productArb, { maxLength: 12 }), budgetArb, (stops, prods, budget) => {
                const day = matchDay(stops, prods, budget);
                const cap = BUDGET_PRICE_CAP_USD[budget];
                const seen = new Set<string>();
                day.forEach((m, i) => {
                    if (isFreeStop(stops[i])) expect(m).toBeNull();
                    if (!m) return;
                    if (cap !== null) expect(m.priceFrom).toBeLessThanOrEqual(cap);
                    expect(seen.has(m.productCode)).toBe(false);
                    seen.add(m.productCode);
                });
            }),
            { numRuns: 300 },
        );
    });
});
