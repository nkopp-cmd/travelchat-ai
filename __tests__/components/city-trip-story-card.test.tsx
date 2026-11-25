import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CityTripStoryCard } from "@/components/blog/city-trip-story-card";
import { BLOG_POSTS, cityTripStory, type BlogPost } from "@/lib/blog/posts";

const sha = "a".repeat(64);
const post = (slug: string, published: string, plannerCity?: string, withImage = true): BlogPost => ({
  slug, file: `${published}-${slug}.md`, title: `T ${slug}`, description: `D ${slug}`, published, updated: published, body: "",
  plannerCity, ...(withImage ? { illustration: { sha, alt: "Evening lane in Kyoto, illustrative", width: 1080, height: 1350 } } : {}),
});

describe("city trip-story card (trip-story T7)", () => {
  it("picks the newest trip story of the city and ignores plain posts and other cities", () => {
    const posts = [post("old", "2026-11-01", "Kyoto"), post("new", "2026-11-20", "Kyoto"), post("plain", "2026-11-24", "Kyoto", false), post("tokyo", "2026-11-25", "Tokyo")];
    expect(cityTripStory("Kyoto", posts)?.slug).toBe("new");
    expect(cityTripStory("Osaka", posts)).toBeUndefined();
  });

  it("links to the post with a lazy 540 px own image and renders nothing without a story", () => {
    const html = renderToStaticMarkup(<CityTripStoryCard cityName="Kyoto" posts={[post("kyoto-2-days", "2026-11-25", "Kyoto")]} />);
    expect(html).toContain('href="/blog/kyoto-2-days"');
    expect(html).toContain(`/media/trip-story/${sha}-540.avif`);
    expect(html).toContain('loading="lazy"');
    expect(html).not.toMatch(/\bAI\b|photo/i);
    expect(renderToStaticMarkup(<CityTripStoryCard cityName="Osaka" posts={[]} />)).toBe("");
  });

  it("the live bundle has a Kyoto trip story", () => {
    expect(cityTripStory("Kyoto", BLOG_POSTS)?.slug).toBe("kyoto-in-2-days-sake-sweets-and-a-soak");
  });
});
