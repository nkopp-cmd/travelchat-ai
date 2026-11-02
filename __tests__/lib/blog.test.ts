import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM build script without type declarations
import { BLOG_BUNDLE, blogSlugs, renderBundle } from "../../scripts/blog-index.mjs";
import { BlogMarkdown, parseBlocks } from "../../lib/blog/markdown";
import { BLOG_POSTS, blogPost, parsePost } from "../../lib/blog/posts";
import { blogPostingJsonLd, blogRss, jsonLdHtml } from "../../lib/blog/seo";

const post = (meta: string, body = "Hello.") => `---\n${meta}\n---\n${body}\n`;
const META = "title: Paying: a guide\ndescription: How to pay.\npublished: 2026-11-02\nupdated: 2026-11-03";

describe("blog posts", () => {
  it("bundle matches content/blog (run node scripts/blog-index.mjs)", () => {
    expect(readFileSync(BLOG_BUNDLE, "utf8")).toBe(renderBundle());
  });

  it("parses front matter, keeps colons in values, slug from the file name", () => {
    const p = parsePost("2026-11-02-paying-in-seoul.md", post(META));
    expect(p).toMatchObject({ slug: "paying-in-seoul", title: "Paying: a guide", published: "2026-11-02", updated: "2026-11-03", body: "Hello." });
  });

  it("refuses bad names, missing keys and wrong dates", () => {
    expect(() => parsePost("paying.md", post(META))).toThrow(/name must be/);
    expect(() => parsePost("2026-11-02-a.md", "no front matter")).toThrow(/front matter/);
    expect(() => parsePost("2026-11-02-a.md", post("title: x\npublished: 2026-11-02\nupdated: 2026-11-02"))).toThrow(/description/);
    expect(() => parsePost("2026-11-01-a.md", post(META))).toThrow(/match the file date/);
    expect(() => parsePost("2026-11-02-a.md", post(META.replace("updated: 2026-11-03", "updated: 2026-11-01")))).toThrow(/before published/);
  });

  it("every post is valid, unique, newest first, and the static page list matches", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
    expect(new Set(BLOG_POSTS.map((p) => p.slug)).size).toBe(BLOG_POSTS.length);
    expect([...BLOG_POSTS].sort((a, b) => b.published.localeCompare(a.published))).toEqual(BLOG_POSTS);
    expect(blogSlugs()).toEqual(BLOG_POSTS.map((p) => p.slug));
    expect(blogPost("paying-in-seoul")?.title).toMatch(/pay in Seoul/);
  });

  it("every post links to a money page and renders without throwing", () => {
    for (const p of BLOG_POSTS) {
      expect(p.body).toMatch(/\]\(\/(itineraries\/new|pricing|sign-up)/);
      expect(() => renderToStaticMarkup(BlogMarkdown({ source: p.body }))).not.toThrow();
      expect(p.body).not.toMatch(/<[a-z]/i);
    }
  });
});

describe("blog markdown", () => {
  it("renders headings, lists, tables and inline marks", () => {
    const html = renderToStaticMarkup(BlogMarkdown({ source: "## Cash now\n\nUse **cash** and *small* notes.\n\n- one [plan](/itineraries/new)\n- two\n\n1. first\n\n| A | B |\n| --- | --- |\n| x | `y` |\n" }));
    expect(html).toContain('<h2 id="cash-now"');
    expect(html).toContain("<strong");
    expect(html).toContain("<em>small</em>");
    expect(html).toMatch(/<ul[^>]*><li>one <a[^>]*href="\/itineraries\/new"/);
    expect(html).toContain("<ol");
    expect(html).toMatch(/<th[^>]*>A<\/th>/);
    expect(html).toContain("<code");
  });

  it("escapes HTML and marks outside links nofollow", () => {
    const html = renderToStaticMarkup(BlogMarkdown({ source: "a <script>x</script> [src](https://example.com/a)" }));
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("refuses unsafe links and tables without a rule line", () => {
    expect(() => renderToStaticMarkup(BlogMarkdown({ source: "[x](javascript:alert(1))" }))).toThrow(/unsupported link/);
    expect(() => parseBlocks("| a |\n| b |")).toThrow(/rule line/);
  });
});

describe("blog SEO", () => {
  const p = parsePost("2026-11-02-a-b.md", post(META.replace("Paying: a guide", "Cards & <cash>")));

  it("BlogPosting JSON-LD has dates, author, publisher and image", () => {
    const ld = blogPostingJsonLd(p);
    expect(ld).toMatchObject({ "@type": "BlogPosting", datePublished: "2026-11-02", dateModified: "2026-11-03", url: "https://www.localley.io/blog/a-b" });
    expect(ld.author.name).toBe("Localley");
    expect(ld.image).toMatch(/^https:\/\//);
    expect(jsonLdHtml(ld)).not.toContain("<");
  });

  it("RSS is escaped and self-linked", () => {
    const rss = blogRss([p]);
    expect(rss).toContain("<title>Cards &amp; &lt;cash&gt;</title>");
    expect(rss).toContain('<atom:link href="https://www.localley.io/blog/rss.xml" rel="self" type="application/rss+xml"/>');
    expect(rss).toContain("<pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate>");
  });
});

