import "server-only";
import { inferCityFromAddress } from "@/lib/cities";
import { getPublicSpotQualityIssue, PUBLIC_SPOT_VISIBILITY_CACHE_VERSION } from "@/lib/spots/public-quality";
import { listingPlaceFor } from "@/lib/spots/listing-place";
import type { PreviewAppDataReader } from "./preview-db";
import { ewkbPoint } from "./ewkb";

/**
 * The spots write hook (localley-decisions.md 2026-10-24): after every facade insert/update of spots, recompute the D1
 * columns the import derives (visible, city, text address, visibility_version) and the listing place, with the same
 * shared rules. Writes outside the facade are not covered; the parity job recomputes every row and reports drift.
 */
export async function recomputeSpots(db: PreviewAppDataReader, keys: (string | number | null)[][]): Promise<void> {
  const ids = keys.map((key) => key[0]).filter((id): id is string => typeof id === "string");
  if (!ids.length) return;
  const { results } = await db.prepare(`SELECT id, name, address_json, latitude, longitude, photos, google_place_id
    FROM spots WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<Record<string, string | number | null>>();
  const statements = results.flatMap((row) => {
    const address = row.address_json ? JSON.parse(String(row.address_json)) as Record<string, string> : null;
    const spot = {
      name: JSON.parse(String(row.name)),
      address,
      location: typeof row.latitude === "number" && typeof row.longitude === "number" ? ewkbPoint(row.longitude, row.latitude) : null,
      photos: row.photos ? JSON.parse(String(row.photos)) as string[] : null,
      google_place_id: (row.google_place_id as string | null) ?? null,
    };
    const text = address ? address.en ?? Object.values(address)[0] ?? "" : "";
    const listing = listingPlaceFor(spot);
    return [
      db.prepare("UPDATE spots SET visible = ?, city = ?, address = ?, visibility_version = ? WHERE id = ?")
        .bind(getPublicSpotQualityIssue(spot) === null ? 1 : 0, inferCityFromAddress(text)?.name ?? null, text || null, PUBLIC_SPOT_VISIBILITY_CACHE_VERSION, String(row.id)),
      db.prepare("DELETE FROM spot_listing_places WHERE spot_id = ?").bind(String(row.id)),
      ...(listing ? [db.prepare("INSERT INTO spot_listing_places (spot_id, provider, place_id, source) VALUES (?, 'google', ?, ?)")
        .bind(String(row.id), listing.placeId, listing.source)] : []),
    ];
  });
  if (statements.length) await db.batch(statements);
}
