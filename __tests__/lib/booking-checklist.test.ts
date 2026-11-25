import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { BookableItem } from "@/components/booking/bookable-card";
import { buildChecklist, checklistGroup, checklistTotals, parseBookedCodes } from "@/lib/booking/checklist";

const item = (productCode: string, title: string, priceFrom?: number, currency = "USD"): BookableItem => ({
    id: productCode, productCode, title, priceFrom, currency, url: `https://www.viator.com/${productCode}`, partner: "viator",
});

describe("booking checklist", () => {
    it("keeps one entry per product in trip order and skips free or unmatched stops", () => {
        const food = item("FOOD1", "Gwangjang Market night food tour", 69);
        const palace = item("PAL1", "Gyeongbokgung Palace entry ticket", 3);
        const entries = buildChecklist(
            [[null, food], [palace, food, null]],
            [["Bukchon walk", "Gwangjang Market"], ["Gyeongbokgung", "Gwangjang again", "Han river park"]],
        );
        expect(entries.map((e) => [e.item.productCode, e.day, e.stopName, e.group])).toEqual([
            ["FOOD1", 1, "Gwangjang Market", "anytime"],
            ["PAL1", 2, "Gyeongbokgung", "early"],
        ]);
    });

    it("groups timed tickets as book early", () => {
        expect(checklistGroup("teamLab Planets Tokyo admission")).toBe("early");
        expect(checklistGroup("Shibuya Sky observation deck")).toBe("early");
        expect(checklistGroup("Korean cooking class")).toBe("anytime");
        expect(checklistGroup("Walking tour", "N Seoul Tower")).toBe("early");
    });

    it("totals only priced entries in the main currency", () => {
        const entries = buildChecklist([[item("A", "a", 40), item("B", "b"), item("C", "c", 30, "EUR"), item("D", "d", 25)]], [["", "", "", ""]]);
        expect(checklistTotals(entries, new Set(["D"]))).toEqual({ currency: "USD", total: 65, toBook: 40, booked: 1, count: 4 });
    });

    it("reads stored marks defensively", () => {
        expect([...parseBookedCodes('["A",1,"B"]')]).toEqual(["A", "B"]);
        expect(parseBookedCodes("{bad").size).toBe(0);
        expect(parseBookedCodes(null).size).toBe(0);
    });

    it("property: 0 <= toBook <= total, total = sum of unique same-currency prices, marking more never raises toBook", () => {
        const product = fc.record({
            code: fc.constantFrom("A", "B", "C", "D", "E", "F"),
            price: fc.option(fc.double({ min: 0.01, max: 2000, noNaN: true }), { nil: undefined }),
            currency: fc.constantFrom("USD", "USD", "USD", "EUR"),
        });
        fc.assert(fc.property(
            fc.array(fc.array(fc.option(product, { nil: null }), { maxLength: 6 }), { maxLength: 5 }),
            fc.subarray(["A", "B", "C", "D", "E", "F"]),
            fc.subarray(["A", "B", "C", "D", "E", "F"]),
            (days, markedA, markedB) => {
                const matches = days.map((d) => d.map((p) => (p ? item(p.code, `T ${p.code}`, p.price, p.currency) : null)));
                const entries = buildChecklist(matches, []);
                const codes = entries.map((e) => e.item.productCode);
                expect(new Set(codes).size).toBe(codes.length);
                const t = checklistTotals(entries, new Set(markedA));
                expect(t.toBook).toBeGreaterThanOrEqual(0);
                expect(t.toBook).toBeLessThanOrEqual(t.total + 1e-9);
                const expected = entries.filter((e) => (e.item.priceFrom ?? 0) > 0 && e.item.currency === t.currency)
                    .reduce((s, e) => s + e.item.priceFrom!, 0);
                expect(t.total).toBeCloseTo(expected, 6);
                const more = checklistTotals(entries, new Set([...markedA, ...markedB]));
                expect(more.toBook).toBeLessThanOrEqual(t.toBook + 1e-9);
                expect(t.count).toBe(entries.length);
            },
        ), { numRuns: 300 });
    });
});
