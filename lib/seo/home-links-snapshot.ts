import snapshot from "./home-links.snapshot.json";
import type { SitemapSpotRow } from "./sitemap";

/** Guide-spot rows for the static home page. Refresh: node scripts/seo/refresh-home-links.mjs, then commit the JSON. */
export function homeLinkRows(): SitemapSpotRow[] {
  return snapshot.rows;
}

/** City hubs the live pages sitemap lists (DK2); empty in an old snapshot. */
export function homeHubNames(): string[] {
  return (snapshot as { hubs?: string[] }).hubs ?? [];
}
