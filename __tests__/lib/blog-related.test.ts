import { describe, expect, it } from "vitest";
import { BLOG_POSTS, postSeries, relatedPosts, type BlogPost } from "../../lib/blog/posts";

const p = (slug: string, published: string): BlogPost => ({ slug, file: `${published}-${slug}.md`, title: slug, description: "", published, updated: published, body: "" });

describe("relatedPosts (push EE1)", () => {
  const posts = [
    p("three-easy-days-in-chiang-mai-for-first-time-visitors", "2026-11-26"),
    p("kyoto-in-2-days-sake-sweets-and-a-soak", "2026-11-25"),
    p("paying-in-tokyo", "2026-11-23"),
    p("paying-in-singapore", "2026-11-13"),
    p("paying-in-bangkok", "2026-11-09"),
    p("paying-in-seoul", "2026-11-02"),
  ];

  it("series from a city tail only", () => {
    expect(postSeries("paying-in-seoul")).toBe("paying-in");
    expect(postSeries("paying-in-hong-kong")).toBe("paying-in");
    expect(postSeries("kyoto-in-2-days-sake-sweets-and-a-soak")).toBeUndefined();
    expect(postSeries("three-easy-days-in-chiang-mai-for-first-time-visitors")).toBeUndefined();
  });

  it("same series first, newest first, never itself", () => {
    expect(relatedPosts(posts[4], posts).map((x) => x.slug)).toEqual(["paying-in-tokyo", "paying-in-singapore", "paying-in-seoul"]);
  });

  it("fills with the newest others when the series is short or missing", () => {
    expect(relatedPosts(posts[1], posts).map((x) => x.slug)).toEqual(["three-easy-days-in-chiang-mai-for-first-time-visitors", "paying-in-tokyo", "paying-in-singapore"]);
    expect(relatedPosts(posts[2], posts, 5).map((x) => x.slug)).toEqual(["paying-in-singapore", "paying-in-bangkok", "paying-in-seoul", "three-easy-days-in-chiang-mai-for-first-time-visitors", "kyoto-in-2-days-sake-sweets-and-a-soak"]);
  });

  it("each post once, limit respected, empty for a lone post", () => {
    for (let n = 0; n < 8; n++) {
      const r = relatedPosts(posts[0], posts, n);
      expect(r.length).toBe(Math.min(n, posts.length - 1));
      expect(new Set(r.map((x) => x.slug)).size).toBe(r.length);
    }
    expect(relatedPosts(posts[0], [posts[0]])).toEqual([]);
  });

  it("every real post links at least one other real post, and every real post is linked by one", () => {
    const linked = new Set(BLOG_POSTS.flatMap((x) => relatedPosts(x).map((r) => r.slug)));
    for (const x of BLOG_POSTS) {
      expect(relatedPosts(x).length).toBeGreaterThan(0);
      expect(linked.has(x.slug)).toBe(true);
    }
  });
});
