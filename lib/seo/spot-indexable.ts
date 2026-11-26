/**
 * Only spots with real guidance go into Google's index. F4 (2026-11-15): a guide (sourced description + practical
 * facts). DK2 (2026-11-26): plus at least one own photo (spot_photos row), so a page shows the place, not a stock
 * card. Every other spot page stays live with `noindex, follow` until the guide run and the photo run fill it.
 */
export function isSpotIndexable(input: { hasGuide: boolean; hasOwnPhoto: boolean }): boolean {
  return input.hasGuide && input.hasOwnPhoto;
}

/**
 * A city hub with fewer guide spots than this is thin: out of the sitemap and `noindex, follow` (DK2: 10, was 5).
 * Counted on guide spots (photo or not): the hub lists every guide spot, so its own page has that many entries.
 */
export const MIN_HUB_SPOTS = 10;

/** DK2: help and blog pages with fewer words than this are tool pages, not guides: `noindex, follow`, out of the sitemap. */
export const MIN_GUIDE_WORDS = 400;

/** Words in a text (Markdown marks count as separators). */
export function wordCount(text: string): number {
  return text.split(/[^\p{L}\p{N}'’-]+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export type SitemapCandidate = {
  id: string; lastmod: string | null; name: string; address: string;
  /** Stored canonical city (lib/cities.ts name); null when the backfill could not place the row. */
  city?: string | null;
  /** At least one spot_photos row (DK2). */
  hasOwnPhoto?: boolean;
};

/** A guide spot. `indexable` = also has an own photo: only those go into the spot sitemap and the crawl links. */
export type IndexableRow = { id: string; lastmod: string | null; hub: string | null; name: string; indexable: boolean };

/** The rows Google may index (spot sitemap, home links, next-spot ring). Rows without the flag count as indexable. */
export function indexableOnly<T extends { indexable?: boolean }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.indexable !== false);
}

/** The hub that lists a row: the stored city, or for rows without one the first hub name in the address. */
export function hubOf(row: { city?: string | null; address: string }, hubCities: readonly string[]): string | null {
  if (row.city) return hubCities.includes(row.city) ? row.city : null;
  const address = row.address.toLowerCase();
  return hubCities.find((name) => address.includes(name.toLowerCase())) ?? null;
}

/**
 * The hub filter in SQL (d1-queries `filters.city`): the stored city, or for rows without one an address match. A row
 * no enabled hub lists has no internal link, so it stays out of the sitemap (L3 orphans: 9 unplaced Depok spots).
 */
export function onEnabledHub(row: { city?: string | null; address: string }, hubCities: readonly string[]): boolean {
  return hubOf(row, hubCities) !== null;
}

/** The newer of two sitemap dates (both YYYY-MM-DDTHH:MM:SS+00:00, so text order = time order). */
const newer = (a: string | null, b: string | null | undefined) => (!b ? a : !a || b > a ? b : a);

/**
 * Sitemap rows worth a crawl: only rows an enabled hub lists (when `hubCities` is given), one row per name + city
 * (address when the city is unknown; the first row in the given score order wins), and only rows with a guide.
 * Each row carries `indexable` (guide + own photo); hub counts use every guide row.
 * lastmod = the newer of the row date and the guide upload date. Sorted by id so chunks stay stable between runs.
 */
export function indexableSitemapRows(
  rows: SitemapCandidate[], guides: ReadonlyMap<string, string | null>, hubCities?: readonly string[],
): IndexableRow[] {
  const seen = new Set<string>();
  const kept: IndexableRow[] = [];
  for (const row of rows) {
    const hub = hubCities ? hubOf(row, hubCities) : row.city ?? null;
    if (hubCities && !hub) continue;
    const key = `${row.name.toLowerCase().trim()}|${(row.city ?? row.address).toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = row.id.toLowerCase();
    if (!guides.has(id)) continue;
    kept.push({
      id: row.id, lastmod: newer(row.lastmod, guides.get(id)), hub, name: row.name.trim(),
      indexable: isSpotIndexable({ hasGuide: true, hasOwnPhoto: row.hasOwnPhoto === true }),
    });
  }
  return kept.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Indexable spots per hub city name. */
export function hubSpotCounts(rows: readonly { hub?: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.hub) counts.set(row.hub, (counts.get(row.hub) ?? 0) + 1);
  return counts;
}

/**
 * Whether a city hub may be indexed. Unknown (no rows: local build, or the D1/R2 read gave nothing) keeps the hub
 * indexable, so a failed read never noindexes every hub.
 */
export function hubIndexable(rows: readonly { hub?: string | null }[], cityName: string): boolean {
  return rows.length === 0 || (hubSpotCounts(rows).get(cityName) ?? 0) >= MIN_HUB_SPOTS;
}

/** Hub H1 + intro: each city hub needs its own heading (all hubs shared "Discover Hidden Gems", L2 2026-11-14). */
export function spotsHubHeading(city?: { name: string; country: string }): { title: string; intro: string } {
  if (!city) {
    return {
      title: "Discover Hidden Gems",
      intro: "Browse local-first restaurants, alleys, markets, cafes, and night spots across Asia. Pick a city, filter by vibe, then save the places worth building a trip around.",
    };
  }
  return {
    title: `Hidden gems in ${city.name}`,
    intro: `Local-first restaurants, alleys, markets, cafes and night spots in ${city.name}, ${city.country}. Filter by area and vibe, then save the places worth building a trip around.`,
  };
}
