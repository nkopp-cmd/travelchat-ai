import { BLOG_POSTS } from "@/lib/blog/posts";
import { ENABLED_CITIES } from "@/lib/cities";
import { HELP_COUNTRIES } from "@/lib/help/phrases";

/**
 * Sitemap index (Nils 2026-11-04): /sitemap.xml lists /sitemaps/pages.xml, /sitemaps/guides.xml and
 * /sitemaps/spots-<n>.xml (max 5,000 URLs each). Only canonical www URLs that answer 200 with index;
 * no redirects (/explore, /dashboard), no auth pages. lastmod is a real row date or absent, never "now".
 */
export const SITE = "https://www.localley.io";
export const SPOTS_PER_SITEMAP = 5000;

export type SitemapEntry = { loc: string; lastmod?: string };
export type SitemapSpotRow = { id: string; lastmod: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\+00:00|Z))?$/;
const latest = (dates: (string | undefined)[]) => dates.filter((d): d is string => !!d).sort().at(-1);

export function pageEntries(): SitemapEntry[] {
  const cities = ENABLED_CITIES.map((city) => ({ loc: `${SITE}/spots?city=${city.slug}` }));
  return [
    { loc: SITE }, { loc: `${SITE}/spots` }, ...cities, { loc: `${SITE}/trending` }, { loc: `${SITE}/templates` },
    { loc: `${SITE}/pricing` }, { loc: `${SITE}/credits` }, { loc: `${SITE}/privacy` }, { loc: `${SITE}/terms` },
  ];
}

/** Traveller guides: the help phrase cards and the journal. */
export function guideEntries(): SitemapEntry[] {
  const help = HELP_COUNTRIES.flatMap((country) => ["", "/pay", "/open", "/menu"].map((sub) => ({ loc: `${SITE}/help/${country.slug}${sub}` })));
  const posts = BLOG_POSTS.map((post) => ({ loc: `${SITE}/blog/${post.slug}`, lastmod: post.updated }));
  return [{ loc: `${SITE}/help` }, ...help, { loc: `${SITE}/blog`, lastmod: latest(posts.map((p) => p.lastmod)) }, ...posts];
}

export function spotEntries(rows: SitemapSpotRow[]): SitemapEntry[] {
  return rows.map((row) => ({ loc: `${SITE}/spots/${encodeURIComponent(row.id)}`, lastmod: row.lastmod ?? undefined }));
}

export function spotChunkCount(total: number): number {
  return Math.max(1, Math.ceil(total / SPOTS_PER_SITEMAP));
}

/** Rows of spot sitemap n (1-based), or null when n is out of range. */
export function spotChunk(rows: SitemapSpotRow[], n: number): SitemapSpotRow[] | null {
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
export function renderIndex(spotRows: SitemapSpotRow[]): string {
  const children: SitemapEntry[] = [
    { loc: `${SITE}/sitemaps/pages.xml` },
    { loc: `${SITE}/sitemaps/guides.xml`, lastmod: latest(guideEntries().map((e) => e.lastmod)) },
    ...Array.from({ length: spotChunkCount(spotRows.length) }, (_, i) => ({
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
