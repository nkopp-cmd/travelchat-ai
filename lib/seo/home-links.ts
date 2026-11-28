import { ENABLED_CITIES } from "@/lib/cities";
import { hubIndexable, indexableOnly } from "./spot-indexable";
import type { SitemapSpotRow } from "./sitemap";

export type HomeSpotLink = { id: string; name: string; hub: string };

/**
 * Indexable guide spots (guide + own photo, DK2) the home page links to (indexing diagnosis F5): a crawl path from the strongest
 * page to the pages we want indexed. Round-robin over hubs (largest first) so every hub gets
 * links; inside a hub the newest guide first. Deterministic for the same rows.
 */
export function homeGuideSpots(rows: readonly SitemapSpotRow[], limit = 12): HomeSpotLink[] {
  const byHub = new Map<string, HomeSpotLink[]>();
  const named = indexableOnly(rows).filter((r) => r.hub && r.name?.trim())
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

/**
 * City hubs the home page links to: the same set the sitemap lists, each with its A-Z list page (Push CC2). `hubs` =
 * the hub names from the snapshot (DK2: rows hold only indexable spots, too few to count a hub's guide spots).
 */
export function homeHubLinks(rows: readonly SitemapSpotRow[], hubs: readonly string[] = []) {
  return ENABLED_CITIES.filter((city) => (hubs.length ? hubs.includes(city.name) : hubIndexable(rows, city.name)))
    .map(({ name, slug }) => ({ name, href: `/spots?city=${slug}`, azHref: `/spots/a-z/${encodeURIComponent(slug)}` }));
}

/**
 * Push DV2: the indexable guide spots (guide + own photo) of one hub, A-Z by name, for the top of /spots/a-z/<city>.
 * The A-Z hubs are the pages Google indexes best; most of their rows link to noindex spots, so this block sends the
 * link value to the ones Google can index. One row per id, names trimmed, at most `limit`. Deterministic.
 */
export function cityGuideSpots(rows: readonly SitemapSpotRow[], city: string, limit = 60): HomeSpotLink[] {
  const seen = new Set<string>();
  const out: HomeSpotLink[] = [];
  for (const r of indexableOnly(rows)) {
    const name = r.name?.trim();
    if (r.hub !== city || !name || seen.has(r.id.toLowerCase())) continue;
    seen.add(r.id.toLowerCase());
    out.push({ id: r.id, name, hub: city });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id)).slice(0, limit);
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
