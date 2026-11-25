import Link from "next/link";
import { cityTripStory, type BlogPost } from "@/lib/blog/posts";

/**
 * Trip-story plan T7: city pages point to the city's ready trip plan (our own story image, 540 px, lazy, so it never
 * competes with the page's LCP). Renders nothing when the city has no trip-story post.
 */
export function CityTripStoryCard({ cityName, posts }: { cityName: string; posts?: readonly BlogPost[] }) {
  const post = cityTripStory(cityName, posts);
  if (!post?.illustration) return null;
  const src = (ext: string) => `/media/trip-story/${post.illustration!.sha}-540.${ext}`;
  return (
    <Link
      prefetch={false}
      href={`/blog/${post.slug}`}
      className="mt-6 flex items-center gap-4 rounded-2xl bg-raised p-3 hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-4"
    >
      <picture className="shrink-0">
        <source type="image/avif" srcSet={src("avif")} />
        <img src={src("webp")} width={96} height={120} alt={post.illustration.alt} loading="lazy" decoding="async"
          className="h-[120px] w-24 rounded-xl bg-muted object-cover" />
      </picture>
      <span className="min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-wide text-primary">Ready-made trip plan</span>
        <span className="mt-1 block text-base font-bold leading-snug text-foreground">{post.title}</span>
        <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{post.description}</span>
      </span>
    </Link>
  );
}
