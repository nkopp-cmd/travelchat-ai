import type { Metadata } from "next";
import { clip } from "@/lib/seo/meta";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@/components/ui/icons";
import { BlogMarkdown } from "@/lib/blog/markdown";
import { BLOG_POSTS, blogPost, formatPostDate } from "@/lib/blog/posts";
import { spotPhotoThumbPath } from "@/lib/spots/own-photo";
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
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(blogPostingJsonLd(post)) }} />
      <Link href="/blog" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Journal
      </Link>
      <article>
        <h1 className="text-3xl font-bold leading-tight text-foreground sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-lg leading-7 text-muted-foreground">{post.description}</p>
        {post.photo && (
          <figure className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- own immutable R2 WebP with its own 480 px copy; no image optimizer */}
            <img
              src={post.photo.src}
              srcSet={`${spotPhotoThumbPath(post.photo.src)} 480w, ${post.photo.src} ${post.photo.width}w`}
              sizes="(min-width: 768px) 720px, 100vw"
              width={post.photo.width}
              height={post.photo.height}
              alt={post.photo.alt}
              fetchPriority="high"
              decoding="async"
              className="h-auto w-full rounded-2xl bg-muted object-cover"
            />
            <figcaption className="mt-2 text-xs text-muted-foreground">
              Photo: {post.photo.credit} · <Link href="/credits" className="underline underline-offset-2 hover:text-foreground">Credits</Link>
            </figcaption>
          </figure>
        )}
        <BlogMarkdown source={post.body} />
        <p className="mt-10 text-sm text-muted-foreground">
          Last updated <time dateTime={post.updated}>{formatPostDate(post.updated)}</time>
        </p>
      </article>
    </main>
  );
}
