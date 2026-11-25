import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlogMarkdown, parseBlocks } from "../../lib/blog/markdown";
import { parsePost } from "../../lib/blog/posts";
import { blogPostingJsonLd } from "../../lib/blog/seo";
import { tripStoryAlt } from "../../lib/blog/trip-story";

// Trip-story plan T2: own AI story images in blog posts (shared/plans/localley-trip-story-posts.md).
const SHA = "b".repeat(64);
const META = "title: Two days in Seoul\ndescription: A real plan.\npublished: 2026-11-26\nupdated: 2026-11-26";
const post = (meta: string, body = "Lead.") => parsePost("2026-11-26-two-days.md", `---\n${META}\n${meta}\n---\n${body}\n`);

describe("trip-story image alt", () => {
  it("needs text and never calls the AI image a photo", () => {
    expect(tripStoryAlt(" Evening market street with lanterns ")).toBe("Evening market street with lanterns");
    expect(() => tripStoryAlt("  ")).toThrow(/alt/);
    for (const bad of ["Photo of Gwangjang Market", "photograph of a street", "Pictures from day 2", "a snapshot"]) {
      expect(() => tripStoryAlt(bad)).toThrow(/photo/);
    }
  });
});

describe("trip-story section image block", () => {
  const line = (alt: string, path: string) => `## Day 1\n\n![${alt}](${path})\n\nWalk on.`;

  it("parses an own trip-story image line between text blocks", () => {
    const blocks = parseBlocks(line("Evening market street", `/media/trip-story/${SHA}-1080.webp`));
    expect(blocks.map((b) => b.type)).toEqual(["h2", "img", "p"]);
    expect(blocks[1]).toEqual({ type: "img", sha: SHA, alt: "Evening market street" });
  });

  it("refuses outside images, other sizes and photo alt text", () => {
    expect(() => parseBlocks(line("x", "https://images.example.com/a.jpg"))).toThrow(/unsupported image/);
    expect(() => parseBlocks(line("x", `/media/story/${SHA}.jpg`))).toThrow(/unsupported image/);
    expect(() => parseBlocks(line("x", `/media/trip-story/${SHA}-540.webp`))).toThrow(/unsupported image/);
    expect(() => parseBlocks(line("Photo of the market", `/media/trip-story/${SHA}-1080.webp`))).toThrow(/photo/);
  });

  it("renders AVIF first, WebP fallback, sized, lazy, with no credit or label", () => {
    const html = renderToStaticMarkup(<BlogMarkdown source={line("Evening market street", `/media/trip-story/${SHA}-1080.webp`)} />);
    expect(html).toContain(`<source type="image/avif" srcSet="/media/trip-story/${SHA}-540.avif 540w, /media/trip-story/${SHA}-1080.avif 1080w"`);
    expect(html).toMatch(new RegExp(`<img src="/media/trip-story/${SHA}-1080.webp" srcSet="[^"]+540w, [^"]+1080w"[^>]*width="1080" height="1350" alt="Evening market street" loading="lazy"`));
    expect(html).not.toMatch(/figcaption|Photo:|AI|Illustration/);
  });
});

describe("trip-story top image (front matter)", () => {
  it("reads illustration + alt, shares the 1080 WebP", () => {
    const p = post(`illustration: ${SHA}\nillustrationAlt: Lantern-lit alley at dusk`);
    expect(p.illustration).toEqual({ sha: SHA, alt: "Lantern-lit alley at dusk", width: 1080, height: 1350 });
    expect(blogPostingJsonLd(p).image).toBe(`https://www.localley.io/media/trip-story/${SHA}-1080.webp`);
  });

  it("refuses a bad sha, a missing or photo alt, and photo + illustration together", () => {
    expect(() => post("illustration: abc\nillustrationAlt: x")).toThrow(/64 hex/);
    expect(() => post(`illustration: ${SHA}`)).toThrow(/illustrationAlt/);
    expect(() => post(`illustration: ${SHA}\nillustrationAlt: Photo of Myeongdong`)).toThrow(/photo/);
    const photo = `photo: /media/spot/0d120515-c856-48cf-8621-7efad0e59568/${"a".repeat(64)}.webp\nphotoAlt: a\nphotoCredit: b\nphotoSize: 10x10`;
    expect(() => post(`${photo}\nillustration: ${SHA}\nillustrationAlt: Alley`)).toThrow(/not both/);
  });

  it("the post page puts the illustration where the photo goes, without the Photo credit line", () => {
    const page = readFileSync("app/blog/[slug]/page.tsx", "utf8");
    const figure = page.indexOf("<TripStoryFigure sha={post.illustration.sha}");
    expect(figure).toBeGreaterThan(page.indexOf("{first && <BlogMarkdown"));
    expect(figure).toBeLessThan(page.indexOf("{after && <BlogMarkdown"));
  });
});
