import snapshot from "./home-links.snapshot.json";
import type { SitemapSpotRow } from "./sitemap";

/** Guide-spot rows for the static home page. Refresh: node scripts/seo/refresh-home-links.mjs, then commit the JSON. */
export function homeLinkRows(): SitemapSpotRow[] {
  return snapshot.rows;
}
