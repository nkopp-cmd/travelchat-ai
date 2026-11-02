import { BLOG_POSTS } from "@/lib/blog/posts";
import { blogRss } from "@/lib/blog/seo";

export const dynamic = "force-static";

export function GET() {
  return new Response(blogRss(BLOG_POSTS), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
