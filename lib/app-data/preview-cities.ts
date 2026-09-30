import "server-only";
import type { NextRequest } from "next/server";
import { projectImportedCities, type ImportedCitySpot } from "./city-counts";
import { previewAppDataReader } from "./preview-db";

export function isPreviewCitiesCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Exact imported-source counts. A pilot-only or partial import is unavailable. */
export async function previewImportedCities() {
  const db = previewAppDataReader();
  const batch = await db.prepare(`SELECT json_extract(counts, '$.legacy_spot_source') AS expected
    FROM legacy_import_batches ORDER BY importedAt DESC LIMIT 1`).first<{ expected: number }>();
  const count = await db.prepare("SELECT count(*) AS actual FROM legacy_spot_source")
    .first<{ actual: number }>();
  if (!batch || !count || !Number.isSafeInteger(batch.expected) || batch.expected < 1 ||
      count.actual !== batch.expected) throw new Error("Imported catalog is incomplete");

  const rows: ImportedCitySpot[] = [];
  let offset = 0;
  while (offset < count.actual) {
    const { results } = await db.prepare(`SELECT s.payload, p.visible FROM legacy_spot_source s
      JOIN spots p ON p.id = s.spotId ORDER BY s.spotId LIMIT 500 OFFSET ?`)
      .bind(offset).all<{ payload: string; visible: number }>();
    if (!Array.isArray(results) || results.length === 0 || results.length > 500) {
      throw new Error("Imported catalog page is incomplete");
    }
    rows.push(...results);
    offset += results.length;
  }
  if (offset !== count.actual) throw new Error("Imported catalog changed during read");
  return projectImportedCities(rows);
}
