import { describe, expect, it } from "vitest";
import { PRICING_LINE_VARIANTS, pricingLine } from "@/lib/seo/pricing-line";

describe("pricingLine", () => {
  it("has at least 5 distinct anchors of 3-7 words", () => {
    const anchors = new Set(PRICING_LINE_VARIANTS.map((v) => v.anchor));
    expect(anchors.size).toBeGreaterThanOrEqual(5);
    for (const anchor of anchors) {
      const words = anchor.split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(3);
      expect(words).toBeLessThanOrEqual(7);
    }
  });

  it("is stable per key and spreads keys over every variant", () => {
    expect(pricingLine("abc")).toBe(pricingLine("abc"));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => pricingLine(`spot-${i}`).anchor));
    expect(seen.size).toBe(PRICING_LINE_VARIANTS.length);
  });
});
