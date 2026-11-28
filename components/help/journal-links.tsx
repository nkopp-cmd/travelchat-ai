import Link from "next/link";
import type { BlogPost } from "@/lib/blog/posts";

/** Journal post cards on the help pages (push EF2, EI2): a crawl path from indexed pages to the posts. */
export function HelpJournalLinks({ posts, id, title = "From the Journal" }: { posts: readonly BlogPost[]; id: string; title?: string }) {
  if (posts.length === 0) return null;
  return (
    <nav aria-labelledby={id} className="mt-8">
      <h2 id={id} className="font-semibold text-foreground">{title}</h2>
      <ul className="mt-3 grid gap-3">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="block min-h-11 rounded-2xl bg-surface p-4 shadow-surface hover:bg-surface/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="block font-semibold text-foreground">{post.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{post.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
