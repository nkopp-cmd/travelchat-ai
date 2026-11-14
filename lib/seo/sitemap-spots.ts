import "server-only";
import { unstable_cache } from "next/cache";
import { dataBackend } from "@/lib/app-data/backend";
import { d1SitemapSpots } from "@/lib/spots/d1-queries";
import { listSpotGuideIds } from "@/lib/spots/guide-store";
import { indexableSitemapRows } from "./spot-indexable";
import { PUBLIC_SPOT_VISIBILITY_CACHE_VERSION } from "@/lib/spots/public-quality";
import type { SitemapSpotRow } from "./sitemap";

async function indexableSpots(): Promise<SitemapSpotRow[]> {
  const [rows, guideIds] = await Promise.all([d1SitemapSpots(), listSpotGuideIds()]);
  return indexableSitemapRows(rows, new Set(guideIds.map((id) => id.toLowerCase())));
}

// v2: thin spots (noindex on the page) and name+address duplicates leave the sitemap.
const cachedSpots = unstable_cache(indexableSpots, ["sitemap-spots-v2", PUBLIC_SPOT_VISIBILITY_CACHE_VERSION], { revalidate: 3600, tags: ["spots"] });

/** Public spot rows for the sitemap; empty when the D1 store is not the serving store (local builds). */
export async function sitemapSpotRows(): Promise<SitemapSpotRow[]> {
  if (dataBackend() !== "d1") return [];
  return cachedSpots();
}
