import { describe, expect, it } from "vitest";
import { HELP_COUNTRIES } from "@/lib/help/phrases";
import { PAY_CHECKED_AT, PAY_SECTIONS, payGuide } from "@/lib/help/pay";

describe("how can I pay here", () => {
  it.each(HELP_COUNTRIES.map((c) => [c.slug]))("%s has every section, short points and https sources", (slug) => {
    const guide = payGuide(slug)!;
    expect(guide).toBeDefined();
    for (const section of PAY_SECTIONS) {
      expect(guide[section.id].length).toBeGreaterThanOrEqual(2);
      for (const point of guide[section.id]) expect(point.split(/\s+/).length).toBeLessThanOrEqual(30);
    }
    expect(guide.tipping.trim()).not.toBe("");
    expect(guide.sources.length).toBeGreaterThanOrEqual(3);
    for (const url of guide.sources) expect(new URL(url).protocol).toBe("https:");
  });

  it("records when the facts were checked", () => {
    expect(PAY_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payGuide("mars")).toBeUndefined();
  });
});
