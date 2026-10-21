import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 2026-10-21 live 390 px review: the scrolling action bar shrank the Link wrappers, so
// "Revise with Alley" wrapped to three lines outside its pill in dark text on violet.
describe("itinerary detail action bar", () => {
  const source = readFileSync("app/itineraries/[id]/page.tsx", "utf8");
  const bar = source.slice(source.indexOf("{/* Action Bar */}"), source.indexOf("<ShareDialog"));

  it("keeps every link wrapper in the scrolling bar from shrinking", () => {
    const wrappers = bar.match(/<(Link|a)\b[^>]*>/g) || [];
    expect(wrappers.length).toBe(3);
    for (const wrapper of wrappers) expect(wrapper).toContain('className="shrink-0"');
  });

  it("keeps the Alley label on one line in white on the violet gradient", () => {
    const revise = bar.slice(bar.indexOf("/dashboard?itinerary="), bar.indexOf("Revise with Alley"));
    expect(revise).toMatch(/whitespace-nowrap/);
    expect(revise).toMatch(/text-white/);
  });
});
