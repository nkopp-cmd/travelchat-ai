// Pure helpers for scripts/seo/orphan-check.mjs (L3, weekend-sprint-20261114).
const SPOT_HREF = /href="(?:https?:\/\/(?:www\.)?localley\.io)?\/spots\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[?#"])/gi;

/** Every <loc> value of a sitemap or sitemap index. */
export function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

/** Lowercase spot ids from /spots/<uuid> URLs (sitemap locs). */
export function spotIdsFromUrls(urls) {
  const ids = new Set();
  for (const url of urls) {
    const m = /\/spots\/([0-9a-f-]{36})(?:$|[?#/])/i.exec(url);
    if (m) ids.add(m[1].toLowerCase());
  }
  return ids;
}

/** Lowercase spot ids linked from an HTML page (anchor hrefs only, not tips/sub-routes). */
export function linkedSpotIds(html) {
  const ids = new Set();
  for (const m of html.matchAll(SPOT_HREF)) ids.add(m[1].toLowerCase());
  return ids;
}

/** Sitemap spot ids that no crawled page links to, sorted. */
export function findOrphans(sitemapIds, linkedIds) {
  return [...sitemapIds].filter((id) => !linkedIds.has(id)).sort();
}
