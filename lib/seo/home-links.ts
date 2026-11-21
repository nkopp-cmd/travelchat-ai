import { ENABLED_CITIES } from "@/lib/cities";
import { hubIndexable } from "./spot-indexable";
import type { SitemapSpotRow } from "./sitemap";

export type HomeSpotLink = { id: string; name: string; hub: string };

/**
 * Guide spots the home page links to (indexing diagnosis F5): a crawl path from the strongest
 * page to the pages we want indexed. Round-robin over hubs (largest first) so every hub gets
 * links; inside a hub the newest guide first. Deterministic for the same rows.
 */
export function homeGuideSpots(rows: readonly SitemapSpotRow[], limit = 12): HomeSpotLink[] {
  const byHub = new Map<string, HomeSpotLink[]>();
  const named = rows.filter((r) => r.hub && r.name?.trim())
    .sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? "") || a.id.localeCompare(b.id));
  for (const r of named) {
    const list = byHub.get(r.hub!) ?? [];
    list.push({ id: r.id, name: r.name!.trim(), hub: r.hub! });
    byHub.set(r.hub!, list);
  }
  const hubs = [...byHub.values()].sort((a, b) => b.length - a.length || a[0].hub.localeCompare(b[0].hub));
  const out: HomeSpotLink[] = [];
  for (let i = 0; out.length < limit && hubs.some((h) => i < h.length); i++) {
    for (const h of hubs) if (i < h.length && out.length < limit) out.push(h[i]);
  }
  return out;
}

/** City hubs the home page links to: the same set the sitemap lists, each with its A-Z list page (Push CC2). */
export function homeHubLinks(rows: readonly SitemapSpotRow[]) {
  return ENABLED_CITIES.filter((city) => hubIndexable(rows, city.name))
    .map(({ name, slug }) => ({ name, href: `/spots?city=${slug}`, azHref: `/spots/a-z/${encodeURIComponent(slug)}` }));
}

export type HomePostLink = { href: string; title: string };

/**
 * Push CC2: the newest journal posts, linked from the home body (Google indexed only "/" on 2026-11-21, and the
 * posts were one footer hop away through /blog). Newest published first, ties by slug. Deterministic.
 */
export function homeJournalLinks(posts: readonly { slug: string; title: string; published: string }[], limit = 3): HomePostLink[] {
  return [...posts].sort((a, b) => b.published.localeCompare(a.published) || a.slug.localeCompare(b.slug))
    .slice(0, limit).map((p) => ({ href: `/blog/${p.slug}`, title: p.title }));
}
