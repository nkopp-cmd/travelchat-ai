import "server-only";
import { unstable_cache } from "next/cache";
import { dataBackend } from "@/lib/app-data/backend";
import { d1SitemapSpots } from "@/lib/spots/d1-queries";
import { PUBLIC_SPOT_VISIBILITY_CACHE_VERSION } from "@/lib/spots/public-quality";
import type { SitemapSpotRow } from "./sitemap";

const cachedSpots = unstable_cache(d1SitemapSpots, ["sitemap-spots", PUBLIC_SPOT_VISIBILITY_CACHE_VERSION], { revalidate: 3600, tags: ["spots"] });

/** Public spot rows for the sitemap; empty when the D1 store is not the serving store (local builds). */
export async function sitemapSpotRows(): Promise<SitemapSpotRow[]> {
  if (dataBackend() !== "d1") return [];
  return cachedSpots();
}
