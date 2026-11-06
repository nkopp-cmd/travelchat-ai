import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Newspaper } from "@/components/ui/icons";
import { BLOG_DESCRIPTION, BLOG_POSTS, BLOG_TITLE, BLOG_URL, formatPostDate } from "@/lib/blog/posts";
import { blogJsonLd, DEFAULT_BLOG_IMAGE, jsonLdHtml, postImage } from "@/lib/blog/seo";

// Share image: the first post's photo, else the default.
const BLOG_IMAGE = BLOG_POSTS[0] ? postImage(BLOG_POSTS[0]) : DEFAULT_BLOG_IMAGE;

export const metadata: Metadata = {
  title: BLOG_TITLE,
  description: BLOG_DESCRIPTION,
  alternates: { canonical: BLOG_URL, types: { "application/rss+xml": `${BLOG_URL}/rss.xml` } },
  openGraph: { title: BLOG_TITLE, description: BLOG_DESCRIPTION, url: BLOG_URL, type: "website", images: [{ url: BLOG_IMAGE }] },
  twitter: { card: "summary_large_image", title: BLOG_TITLE, description: BLOG_DESCRIPTION, images: [BLOG_IMAGE] },
};

export const dynamic = "force-static";

export default function BlogIndexPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(blogJsonLd(BLOG_POSTS)) }} />
      <PageHeader eyebrow="Journal" eyebrowIcon={Newspaper} title={BLOG_TITLE} lede={BLOG_DESCRIPTION} />
      <ul className="mt-6 flex flex-col gap-3">
        {BLOG_POSTS.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}
              className="flex flex-col gap-1 rounded-2xl bg-surface p-4 shadow-surface transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <span className="text-lg font-semibold text-foreground">{post.title}</span>
              <span className="text-base leading-7 text-muted-foreground">{post.description}</span>
              <time dateTime={post.published} className="text-sm text-muted-foreground">{formatPostDate(post.published)}</time>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-base leading-7 text-foreground">
        Going soon? <Link href="/itineraries/new" className="font-semibold text-primary underline underline-offset-2">Plan a free day with local spots</Link> or
        {" "}<Link href="/help" className="font-semibold text-primary underline underline-offset-2">open the phrase cards</Link>.
      </p>
    </main>
  );
}
