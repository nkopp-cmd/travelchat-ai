import type { Metadata } from "next";
import { clip } from "@/lib/seo/meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@/components/ui/icons";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { BlogMarkdown } from "@/lib/blog/markdown";
import { BLOG_POSTS, blogPost, formatPostDate, plannerHref, splitLead } from "@/lib/blog/posts";
import { spotPhotoSrcSet } from "@/lib/spots/own-photo";
import { blogPostingJsonLd, jsonLdHtml, postImage, postUrl } from "@/lib/blog/seo";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = blogPost((await params).slug);
  if (!post) return {};
  const image = postImage(post);
  const size = !post.image && post.photo ? { width: post.photo.width, height: post.photo.height } : { width: 1200, height: 630 };
  // " | Localley" (11 chars) only when the whole title still fits 65 chars; long post titles stand alone.
  return {
    title: post.title.length + 11 <= 65 ? post.title : { absolute: clip(post.title, 65) },
    description: post.description,
    alternates: { canonical: postUrl(post), types: { "application/rss+xml": "https://www.localley.io/blog/rss.xml" } },
    openGraph: {
      title: post.title, description: post.description, url: postUrl(post), type: "article",
      publishedTime: post.published, modifiedTime: post.updated, images: [{ url: image, ...size }],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: [image] },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = blogPost((await params).slug);
  if (!post) notFound();
  const { lead, rest } = splitLead(post.body);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(blogPostingJsonLd(post)) }} />
      <Link href="/blog" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Journal
      </Link>
      <article>
        <h1 className="text-3xl font-bold leading-tight text-foreground sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-lg leading-7 text-muted-foreground">{post.description}</p>
        {lead && <BlogMarkdown source={lead} returnPath={`/blog/${post.slug}`} />}
        {post.photo && (
          <figure className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- own immutable R2 WebP with its 480/960 px copies; no image optimizer */}
            <img
              src={post.photo.src}
              srcSet={spotPhotoSrcSet(post.photo.src, post.photo.width)}
              sizes="(min-width: 768px) 720px, 100vw"
              width={post.photo.width}
              height={post.photo.height}
              alt={post.photo.alt}
              loading="lazy"
              decoding="async"
              className="h-auto w-full rounded-2xl bg-muted object-cover"
            />
            <figcaption className="mt-2 text-xs text-muted-foreground">
              Photo: {post.photo.credit} · <Link href="/credits" className="underline underline-offset-2 hover:text-foreground">Credits</Link>
            </figcaption>
          </figure>
        )}
        {rest && <BlogMarkdown source={rest} returnPath={`/blog/${post.slug}`} />}
        <p className="mt-10 text-sm text-muted-foreground">
          Last updated <time dateTime={post.updated}>{formatPostDate(post.updated)}</time>
        </p>
      </article>
      {post.plannerCity && (
        <section className="mt-10 rounded-2xl bg-surface p-5 shadow-surface">
          <h2 className="text-xl font-semibold text-foreground">Plan your {post.plannerCity} days</h2>
          <p className="mt-2 text-base leading-7 text-muted-foreground">
            Get a free day-by-day {post.plannerCity} plan built from spots locals rate. Your first plan needs no account.
          </p>
          <Link href={plannerHref(post.plannerCity)}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Plan a free {post.plannerCity} trip
          </Link>
        </section>
      )}
      <LocalleySignup source="blog" className="mt-10" />
    </div>
  );
}
