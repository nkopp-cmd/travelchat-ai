import { BLOG_DESCRIPTION, BLOG_TITLE, BLOG_URL, type BlogPost } from "./posts";

export const DEFAULT_BLOG_IMAGE = "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1200&h=630&auto=format&fit=crop";

const publisher = {
  "@type": "Organization",
  name: "Localley",
  url: "https://www.localley.io",
  logo: { "@type": "ImageObject", url: "https://www.localley.io/android-chrome-512x512.png" },
};

export function postUrl(post: BlogPost): string {
  return `${BLOG_URL}/${post.slug}`;
}

export function blogPostingJsonLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.published,
    dateModified: post.updated,
    image: post.image ?? DEFAULT_BLOG_IMAGE,
    url: postUrl(post),
    mainEntityOfPage: { "@type": "WebPage", "@id": postUrl(post) },
    author: { "@type": "Organization", name: "Localley", url: "https://www.localley.io" },
    publisher,
  };
}

export function blogJsonLd(posts: BlogPost[]) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    url: BLOG_URL,
    publisher,
    blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: postUrl(p), datePublished: p.published, dateModified: p.updated })),
  };
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function blogRss(posts: BlogPost[]): string {
  const items = posts.map((p) => [
    "    <item>",
    `      <title>${xml(p.title)}</title>`,
    `      <link>${postUrl(p)}</link>`,
    `      <guid isPermaLink="true">${postUrl(p)}</guid>`,
    `      <pubDate>${new Date(`${p.published}T00:00:00Z`).toUTCString()}</pubDate>`,
    `      <description>${xml(p.description)}</description>`,
    "    </item>",
  ].join("\n"));
  const lastBuild = posts.reduce((max, p) => (p.updated > max ? p.updated : max), "1970-01-01");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xml(BLOG_TITLE)}</title>`,
    `    <link>${BLOG_URL}</link>`,
    `    <description>${xml(BLOG_DESCRIPTION)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${new Date(`${lastBuild}T00:00:00Z`).toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${BLOG_URL}/rss.xml" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
