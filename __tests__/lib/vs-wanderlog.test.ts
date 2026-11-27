import { describe, expect, it } from "vitest";
import { pageEntries } from "@/lib/seo/sitemap";
import { TIER_CONFIGS } from "@/lib/subscription";
import { usd, VS_WANDERLOG as P } from "@/lib/vs/wanderlog";

// Push DR3: the comparison page must stay honest and fit search snippets (vs-and-alternatives rules).
describe("/vs/wanderlog content", () => {
    it("fits title and description limits and names both products", () => {
        expect(P.title.length).toBeLessThanOrEqual(60);
        expect(P.title).toContain("Localley vs Wanderlog");
        expect(P.description.length).toBeGreaterThanOrEqual(140);
        expect(P.description.length).toBeLessThanOrEqual(160);
        expect(P.description).toContain("Localley vs Wanderlog");
    });

    it("gives the verdict in at most 50 words, Wanderlog first", () => {
        expect(P.verdict.length).toBeGreaterThanOrEqual(2);
        expect(P.verdict.join(" ").split(/\s+/).length).toBeLessThanOrEqual(50);
        expect(P.verdict[0]).toMatch(/^Pick Wanderlog/);
    });

    it("lists at least three honest points where Wanderlog wins and 3-5 FAQs", () => {
        expect(P.themBetter.length).toBeGreaterThanOrEqual(3);
        expect(P.faq.length).toBeGreaterThanOrEqual(3);
        expect(P.faq.length).toBeLessThanOrEqual(5);
    });

    it("cites only https sources, every reason has one", () => {
        for (const s of [...P.sources.map((x) => x.url), ...P.reasons.map((r) => r.source), ...P.themBetter.map((t) => t.source)]) {
            expect(new URL(s).protocol).toBe("https:");
        }
    });

    it("takes Localley prices from TIER_CONFIGS and rounds nothing", () => {
        expect(P.priceRows.map((r) => r.us)).toEqual([TIER_CONFIGS.pro.price, TIER_CONFIGS.pro.price * 2, TIER_CONFIGS.pro.yearlyPrice]);
        expect(usd(9)).toBe("$9.00");
        expect(usd(16.99)).toBe("$16.99");
    });

    it("is in the sitemap", () => {
        expect(pageEntries().map((e) => e.loc)).toContain("https://www.localley.io/vs/wanderlog");
    });
});
