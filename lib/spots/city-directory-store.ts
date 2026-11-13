import "server-only";
import { unstable_cache } from "next/cache";
import { dataBackend } from "@/lib/app-data/backend";
import { d1FilteredSpotKeys } from "./d1-queries";
import { dedupePublicSpotRows } from "./queries";
import { PUBLIC_SPOT_VISIBILITY_CACHE_VERSION } from "./public-quality";
import { toDirectoryEntries, type CityDirectoryEntry } from "./city-directory";

async function loadCityDirectory(citySlug: string): Promise<CityDirectoryEntry[]> {
  // Same rows and order as the hub list (score order, then the hub's name+address dedupe), all pages at once.
  const rows = await d1FilteredSpotKeys({ city: citySlug, category: null, score: null, sortBy: "score", search: null, page: 1, limit: 0 });
  return toDirectoryEntries(dedupePublicSpotRows(rows));
}

const cachedCityDirectory = unstable_cache(loadCityDirectory, ["city-directory", PUBLIC_SPOT_VISIBILITY_CACHE_VERSION],
  { revalidate: 3600, tags: ["spots"] });

/** Every public spot of one city hub, A-Z (one cached D1 read per city and hour); empty outside D1. */
export async function cityDirectory(citySlug: string | null | undefined): Promise<CityDirectoryEntry[]> {
  if (!citySlug || dataBackend() !== "d1") return [];
  try {
    return await cachedCityDirectory(citySlug);
  } catch (error) {
    console.error("[city-directory] unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}
