import { splitDescriptionLinks } from "@/lib/spots/description-links";

/**
 * Thin spot pages (no own guide, a short or missing description, or no photo) stay out of Google's index until they
 * are filled: GSC 2026-11-14 showed 0 of 3,161 sitemap URLs indexed and "Discovered - currently not indexed" on
 * sampled spots, so the sitemap must carry only pages worth a crawl. The page keeps `follow`, so its links still count.
 */
export const MIN_INDEXABLE_DESCRIPTION = 80;

export type SpotIndexInput = {
  /** English description as stored (links are stripped here, as on the page). */
  description: string | null | undefined;
  hasPhoto: boolean;
  hasGuide: boolean;
};

export function isSpotIndexable(input: SpotIndexInput): boolean {
  if (input.hasGuide) return true;
  const text = splitDescriptionLinks(input.description ?? "").text.trim();
  return input.hasPhoto && text.length >= MIN_INDEXABLE_DESCRIPTION;
}

export type SitemapCandidate = {
  id: string; lastmod: string | null; name: string; address: string; description: string; hasPhoto: boolean;
};

/**
 * Sitemap rows worth a crawl: the hub's name+address dedupe (first row in the given order wins, as on the hub), then
 * isSpotIndexable with the stored guide ids, sorted by id so chunks stay stable between runs.
 */
export function indexableSitemapRows(rows: SitemapCandidate[], guideIds: ReadonlySet<string>): { id: string; lastmod: string | null }[] {
  const seen = new Set<string>();
  const kept: { id: string; lastmod: string | null }[] = [];
  for (const row of rows) {
    const key = `${row.name.toLowerCase().trim()}|${row.address.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hasGuide = guideIds.has(row.id.toLowerCase());
    if (isSpotIndexable({ description: row.description, hasPhoto: row.hasPhoto, hasGuide })) kept.push({ id: row.id, lastmod: row.lastmod });
  }
  return kept.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
