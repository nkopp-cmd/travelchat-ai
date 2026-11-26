import "server-only";
import { unstable_cache } from "next/cache";
import { ENABLED_CITIES } from "@/lib/cities";
import { dataBackend } from "@/lib/app-data/backend";
import { d1SitemapSpots } from "@/lib/spots/d1-queries";
import { SPOT_DEDUPE_VERSION, dedupePublicSpotRows } from "@/lib/spots/queries";
import { listSpotGuides } from "@/lib/spots/guide-store";
import { indexableSitemapRows } from "./spot-indexable";
import { PUBLIC_SPOT_VISIBILITY_CACHE_VERSION } from "@/lib/spots/public-quality";
import type { SitemapSpotRow } from "./sitemap";

async function indexableSpots(): Promise<SitemapSpotRow[]> {
  const [rows, guides] = await Promise.all([d1SitemapSpots(), listSpotGuides()]);
  const uploaded = new Map(guides.map((guide) => [guide.id.toLowerCase(), guide.uploaded]));
  // The hub list's twin dedupe first (same score order), so a twin the hub hides never reaches the sitemap.
  return indexableSitemapRows(dedupePublicSpotRows(rows), uploaded, ENABLED_CITIES.map((city) => city.name));
}

// v5 (DK2 2026-11-26): rows carry `indexable` (guide + own photo); the spot sitemap lists only those.
// v4 (F3/F4 2026-11-15): guide spots only, dedupe name+city, lastmod includes the guide upload, rows carry their hub.
// v3: rows no enabled hub lists leave too. v2: thin spots (noindex on the page) and name+address duplicates leave the sitemap.
const cachedSpots = unstable_cache(indexableSpots, ["sitemap-spots-v5", PUBLIC_SPOT_VISIBILITY_CACHE_VERSION, SPOT_DEDUPE_VERSION], { revalidate: 3600, tags: ["spots"] });

/** Public spot rows for the sitemap; empty when the D1 store is not the serving store (local builds). */
export async function sitemapSpotRows(): Promise<SitemapSpotRow[]> {
  if (dataBackend() !== "d1") return [];
  return cachedSpots();
}
