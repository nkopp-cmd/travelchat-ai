import { describe, expect, it } from "vitest";
import { BLOG_POSTS, cityJournalPosts, type BlogPost } from "../../lib/blog/posts";

const p = (slug: string, published: string, extra: Partial<BlogPost> = {}): BlogPost => ({ slug, file: `${published}-${slug}.md`, title: slug, description: "", published, updated: published, body: "", ...extra });
const story = { sha: "abc", alt: "story" } as BlogPost["illustration"];

describe("cityJournalPosts (push EL1)", () => {
  const posts = [
    p("kyoto-in-2-days", "2026-11-25", { plannerCity: "Kyoto", illustration: story }),
    p("kyoto-food-notes", "2026-11-20", { plannerCity: "Kyoto" }),
    p("kyoto-old-notes", "2026-11-01", { plannerCity: "Kyoto" }),
    p("paying-in-tokyo", "2026-11-23"),
    p("paying-in-seoul", "2026-11-02"),
    p("paying-in-seoul-extra", "2026-11-03"),
  ];

  it("matches the paying-in-<slug> post exactly", () => {
    expect(cityJournalPosts({ name: "Seoul", slug: "seoul" }, posts).map((x) => x.slug)).toEqual(["paying-in-seoul"]);
  });

  it("skips the trip-story post and sorts newest first", () => {
    expect(cityJournalPosts({ name: "Kyoto", slug: "kyoto" }, posts).map((x) => x.slug)).toEqual(["kyoto-food-notes", "kyoto-old-notes"]);
  });

  it("respects the limit and returns nothing for a city without posts", () => {
    expect(cityJournalPosts({ name: "Kyoto", slug: "kyoto" }, posts, 1)).toHaveLength(1);
    expect(cityJournalPosts({ name: "Taipei", slug: "taipei" }, posts)).toEqual([]);
  });

  it("the live posts give Seoul and Tokyo their paying-in guide", () => {
    for (const [name, slug] of [["Seoul", "seoul"], ["Tokyo", "tokyo"]] as const) {
      expect(cityJournalPosts({ name, slug }, BLOG_POSTS).map((x) => x.slug)).toContain(`paying-in-${slug}`);
    }
  });
});
