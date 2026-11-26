import { BLOG_POSTS } from "@/lib/blog/posts";
import { ENABLED_CITIES } from "@/lib/cities";
import { HELP_COUNTRIES } from "@/lib/help/phrases";
import { hubIndexable, indexableOnly } from "./spot-indexable";

/**
 * Sitemap index (Nils 2026-11-04): /sitemap.xml lists /sitemaps/pages.xml, /sitemaps/guides.xml and
 * /sitemaps/spots-<n>.xml (max 5,000 URLs each). Only canonical www URLs that answer 200 with index;
 * no redirects (/explore, /dashboard), no auth pages. lastmod is a real row date or absent, never "now".
 */
export const SITE = "https://www.localley.io";
export const SPOTS_PER_SITEMAP = 5000;

export type SitemapEntry = { loc: string; lastmod?: string };
export type SitemapSpotRow = { id: string; lastmod: string | null; hub?: string | null; name?: string; indexable?: boolean };
/** A viral event page (/trending/<slug>) that answers 200; lastSeen is the newest news date for it. */
export type SitemapTrendingEvent = { slug: string; lastSeen?: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\+00:00|Z))?$/;
const latest = (dates: (string | undefined)[]) => dates.filter((d): d is string => !!d).sort().at(-1);

/**
 * Static pages plus every city hub with enough indexable spots (`spotRows` omitted = all hubs, e.g. in tests).
 * A hub's lastmod is the newest date of the spots it lists, /spots the newest of all (reach R5 loop 1: Google left
 * the hubs "Discovered - currently not indexed" with no lastmod to tell it they changed). Static pages stay without.
 * /credits, /privacy and /terms stay out (Push BK2, diagnosis RC2): Google indexes few Localley URLs, so the sitemap
 * names only money and entry pages; the footer still links the legal pages.
 */
export function pageEntries(spotRows: readonly SitemapSpotRow[] = [], trending: readonly SitemapTrendingEvent[] = []): SitemapEntry[] {
  const newest = (rows: readonly SitemapSpotRow[]) => latest(rows.map((row) => row.lastmod ?? undefined));
  // Push CL4: each indexable hub also lists its A-Z page (same noindex rule as app/spots/a-z/[city]).
  const cities = ENABLED_CITIES.filter((city) => hubIndexable(spotRows, city.name)).flatMap((city) => {
    const lastmod = newest(spotRows.filter((row) => row.hub === city.name));
    return [{ loc: `${SITE}/spots?city=${city.slug}`, lastmod }, { loc: `${SITE}/spots/a-z/${encodeURIComponent(city.slug)}`, lastmod }];
  });
  return [
    { loc: SITE }, { loc: `${SITE}/spots`, lastmod: newest(spotRows) }, ...cities, { loc: `${SITE}/trending` }, ...trendingEntries(trending),
    { loc: `${SITE}/templates` }, { loc: `${SITE}/pricing` },
  ];
}

/** Viral event pages: self-canonical and indexed, but Google did not know them (sitemap gap 2026-11-26). */
export function trendingEntries(events: readonly SitemapTrendingEvent[]): SitemapEntry[] {
  const seen = new Set<string>();
  return events.flatMap((event) => {
    if (!/^[a-z0-9][a-z0-9-]{2,95}$/.test(event.slug) || seen.has(event.slug)) return [];
    seen.add(event.slug);
    // The scout writes full ISO times (with ms); the sitemap date format takes the day only.
    const day = /^\d{4}-\d{2}-\d{2}/.exec(event.lastSeen ?? "")?.[0];
    return [{ loc: `${SITE}/trending/${event.slug}`, lastmod: day }];
  });
}

/** Traveller guides: the help phrase cards and the journal. */
export function guideEntries(): SitemapEntry[] {
  // DK2: the /pay, /open and /menu tool pages are under MIN_GUIDE_WORDS (noindex, follow), so only the country guides.
  const help = HELP_COUNTRIES.map((country) => ({ loc: `${SITE}/help/${country.slug}` }));
  const posts = BLOG_POSTS.map((post) => ({ loc: `${SITE}/blog/${post.slug}`, lastmod: post.updated }));
  return [{ loc: `${SITE}/help` }, ...help, { loc: `${SITE}/blog`, lastmod: latest(posts.map((p) => p.lastmod)) }, ...posts];
}

/** Spot sitemap entries: only indexable rows (DK2: guide + own photo). */
export function spotEntries(rows: SitemapSpotRow[]): SitemapEntry[] {
  return indexableOnly(rows).map((row) => ({ loc: `${SITE}/spots/${encodeURIComponent(row.id)}`, lastmod: row.lastmod ?? undefined }));
}

export function spotChunkCount(total: number): number {
  return Math.max(1, Math.ceil(total / SPOTS_PER_SITEMAP));
}

/** Rows of spot sitemap n (1-based), or null when n is out of range. */
export function spotChunk(allRows: SitemapSpotRow[], n: number): SitemapSpotRow[] | null {
  const rows = indexableOnly(allRows);
  if (!Number.isInteger(n) || n < 1 || n > spotChunkCount(rows.length)) return null;
  return rows.slice((n - 1) * SPOTS_PER_SITEMAP, n * SPOTS_PER_SITEMAP);
}

/** Child sitemap name ("pages", "guides", "spots-2") from the /sitemaps/<file> segment. */
export function parseSitemapFile(file: string): { kind: "pages" } | { kind: "guides" } | { kind: "spots"; n: number } | null {
  if (file === "pages.xml") return { kind: "pages" };
  if (file === "guides.xml") return { kind: "guides" };
  const match = /^spots-([1-9]\d{0,3})\.xml$/.exec(file);
  return match ? { kind: "spots", n: Number(match[1]) } : null;
}

const escapeXml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const lastmodTag = (lastmod?: string) => (lastmod && DATE.test(lastmod) ? `<lastmod>${lastmod}</lastmod>` : "");

export function renderUrlset(entries: SitemapEntry[]): string {
  const urls = entries.map((e) => `<url><loc>${escapeXml(e.loc)}</loc>${lastmodTag(e.lastmod)}</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** The index: one <sitemap> per child, lastmod = the newest lastmod inside that child. */
export function renderIndex(spotRows: SitemapSpotRow[], trending: readonly SitemapTrendingEvent[] = []): string {
  const children: SitemapEntry[] = [
    { loc: `${SITE}/sitemaps/pages.xml`, lastmod: latest(pageEntries(spotRows, trending).map((e) => e.lastmod)) },
    { loc: `${SITE}/sitemaps/guides.xml`, lastmod: latest(guideEntries().map((e) => e.lastmod)) },
    ...Array.from({ length: spotChunkCount(indexableOnly(spotRows).length) }, (_, i) => ({
      loc: `${SITE}/sitemaps/spots-${i + 1}.xml`,
      lastmod: latest((spotChunk(spotRows, i + 1) ?? []).map((row) => row.lastmod ?? undefined)),
    })),
  ];
  const items = children.map((e) => `<sitemap><loc>${escapeXml(e.loc)}</loc>${lastmodTag(e.lastmod)}</sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
}

export const SITEMAP_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
};
