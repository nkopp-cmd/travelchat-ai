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

/** City hubs the home page links to: the same set the sitemap lists. */
export function homeHubLinks(rows: readonly SitemapSpotRow[]) {
  return ENABLED_CITIES.filter((city) => hubIndexable(rows, city.name)).map(({ name, slug }) => ({ name, href: `/spots?city=${slug}` }));
}
