import "server-only";
import type { NextRequest } from "next/server";
import { ENABLED_CITIES } from "@/lib/cities";
import { shouldShowPublicSpot, PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS } from "@/lib/spots/public-quality";
import { previewAppDataReader } from "./preview-db";

export function isPreviewCitiesCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

type CityStatus = "recommended" | "available" | "beta" | "hidden";

function english(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = (value as Record<string, unknown>).en;
  return typeof field === "string" ? field : "";
}

const excludedNames = PUBLIC_SPOT_NAME_EXCLUSION_PATTERNS.map(pattern =>
  new RegExp(`^${pattern.split("%").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i"));

/** Exact imported-source counts. A pilot-only or partial import is unavailable. */
export async function previewImportedCities() {
  const db = previewAppDataReader();
  const batch = await db.prepare(`SELECT json_extract(counts, '$.legacy_spot_source') AS expected
    FROM legacy_import_batches ORDER BY importedAt DESC LIMIT 1`).first<{ expected: number }>();
  const count = await db.prepare("SELECT count(*) AS actual FROM legacy_spot_source")
    .first<{ actual: number }>();
  if (!batch || !count || !Number.isSafeInteger(batch.expected) || batch.expected < 1 ||
      count.actual !== batch.expected) throw new Error("Imported catalog is incomplete");

  const counts = new Map(ENABLED_CITIES.map(city => [city.slug, 0]));
  let offset = 0;
  while (offset < count.actual) {
    const { results } = await db.prepare(`SELECT s.payload, p.visible FROM legacy_spot_source s
      JOIN spots p ON p.id = s.spotId ORDER BY s.spotId LIMIT 500 OFFSET ?`)
      .bind(offset).all<{ payload: string; visible: number }>();
    if (!Array.isArray(results) || results.length === 0 || results.length > 500) {
      throw new Error("Imported catalog page is incomplete");
    }
    for (const row of results) {
      if (row.visible !== 1) continue;
      const spot = JSON.parse(row.payload);
      const name = english(spot.name);
      // Match the existing SQL prefilter before its quality filter.
      if (!name || excludedNames.some(pattern => pattern.test(name)) || !Array.isArray(spot.photos) ||
          spot.photos.length === 0 || !shouldShowPublicSpot(spot)) continue;
      const address = english(spot.address).toLowerCase();
      for (const city of ENABLED_CITIES) {
        if (address.includes(city.name.toLowerCase())) {
          counts.set(city.slug, (counts.get(city.slug) ?? 0) + 1);
        }
      }
    }
    offset += results.length;
  }
  if (offset !== count.actual) throw new Error("Imported catalog changed during read");
  return ENABLED_CITIES.map(city => {
    const spotCount = counts.get(city.slug) ?? 0;
    const status: CityStatus = spotCount >= 150 ? "recommended"
      : spotCount >= 60 ? "available" : spotCount >= 1 ? "beta" : "hidden";
    return { ...city, spotCount, status };
  });
}
