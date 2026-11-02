import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  overlap,
  rankTopics,
  recentSlugs,
  seasonLead,
  seasonScore,
  SEASONS,
  // @ts-expect-error -- plain ESM script without type declarations
} from "../../scripts/weekly-post-topic.mjs";

const pay = JSON.parse(readFileSync("lib/help/pay.json", "utf8"));
const phrases = JSON.parse(readFileSync("lib/help/source.json", "utf8"));
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const winter = SEASONS.find((s: { slug: string }) => s.slug === "seoul-winter-day-plan");

describe("weekly-post-topic", () => {
  it("measures season lead time across the year end", () => {
    expect(seasonLead(winter, day("2026-11-02"))).toBe(29);
    expect(seasonLead(winter, day("2027-01-15"))).toBe(0);
    expect(seasonLead(winter, day("2027-03-01"))).toBe(275);
    expect([seasonScore(29), seasonScore(0), seasonScore(75), seasonScore(5), seasonScore(200)]).toEqual([90, 60, 50, 0, 0]);
  });

  it("treats the same topic as a repeat, another city or topic not", () => {
    expect(overlap("paying-in-seoul", "paying-in-seoul")).toBe(1);
    expect(overlap("paying-in-seoul", "paying-in-tokyo")).toBe(0);
    expect(overlap("seoul-winter-day-plan", "paying-in-seoul")).toBeLessThan(0.5);
  });

  it("only counts posts of the last 12 weeks", () => {
    const files = ["2026-11-02-paying-in-seoul.md", "2026-07-01-paying-in-tokyo.md", "2026-12-01-future.md"];
    expect(recentSlugs(files, day("2026-11-09"))).toEqual(["paying-in-seoul"]);
  });

  it("ranks seasons ahead and skips a recent repeat", () => {
    const topics = rankTopics({ date: day("2026-11-02"), files: ["2026-11-02-paying-in-seoul.md"], pay, phrases });
    const slugs = topics.map((t: { slug: string }) => t.slug);
    expect(slugs).not.toContain("paying-in-seoul");
    expect(slugs.slice(0, 3)).toContain("seoul-winter-day-plan");
    expect(slugs).toContain("paying-in-tokyo");
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const t of topics) expect(t.link).toMatch(/^\/(help|itineraries)\//);
    const later = rankTopics({ date: day("2027-02-15"), files: ["2026-11-02-paying-in-seoul.md"], pay, phrases });
    expect(later.map((t: { slug: string }) => t.slug)).toContain("paying-in-seoul");
  });
});
