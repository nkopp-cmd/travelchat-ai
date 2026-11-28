import { describe, expect, it } from "vitest";
import { BLOG_POSTS, countryPosts, postCountryCode, type BlogPost } from "../../lib/blog/posts";

const p = (slug: string, published: string, plannerCity?: string): BlogPost => ({ slug, file: `${published}-${slug}.md`, title: slug, description: "", published, updated: published, body: "", plannerCity });

describe("countryPosts (push EF2)", () => {
  const posts = [
    p("three-easy-days-in-chiang-mai-for-first-time-visitors", "2026-11-26", "Chiang Mai"),
    p("kyoto-in-2-days-sake-sweets-and-a-soak", "2026-11-25", "Kyoto"),
    p("paying-in-tokyo", "2026-11-23"),
    p("paying-in-singapore", "2026-11-13", "Singapore"),
    p("paying-in-bangkok", "2026-11-09", "Bangkok"),
    p("paying-in-seoul", "2026-11-02", "Seoul"),
  ];

  it("reads the country from the planner city, else the paying-in slug tail", () => {
    expect(postCountryCode(posts[1])).toBe("JP");
    expect(postCountryCode(posts[2])).toBe("JP"); // no planner city: slug tail "tokyo"
    expect(postCountryCode(p("a-note", "2026-11-01"))).toBeUndefined();
  });

  it("puts paying-in posts first, then the newest other posts of that country", () => {
    expect(countryPosts("JP", posts).map((x) => x.slug)).toEqual(["paying-in-tokyo", "kyoto-in-2-days-sake-sweets-and-a-soak"]);
    expect(countryPosts("TH", posts).map((x) => x.slug)).toEqual(["paying-in-bangkok", "three-easy-days-in-chiang-mai-for-first-time-visitors"]);
  });

  it("returns nothing for a country without posts, and respects the limit", () => {
    expect(countryPosts("VN", posts)).toEqual([]);
    expect(countryPosts("", posts)).toEqual([]);
    expect(countryPosts("JP", posts, 1)).toHaveLength(1);
    expect(countryPosts("JP", posts, -2)).toEqual([]);
  });

  it("every live paying-in post maps to a country with a help pay page", () => {
    const help = new Set(["KR", "JP", "TH", "VN", "TW", "SG"]);
    for (const post of BLOG_POSTS.filter((x) => x.slug.startsWith("paying-in-"))) expect(help.has(postCountryCode(post) ?? "")).toBe(true);
  });
});
