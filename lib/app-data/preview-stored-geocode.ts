import "server-only";
import type { NextRequest } from "next/server";
import { previewAppDataReader } from "./preview-db";

interface StoredSpot {
  id: string;
  address: string;
  name: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  payload: string;
  publicIssue: string | null;
}

export function isPreviewStoredGeocodeCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

export function validStoredGeocodeQuery(address: string | null, city: string | null, name: string | null): boolean {
  return !!address?.trim() && address.length <= 512 && !!city?.trim() && city.length <= 100
    && (name === null || (!!name.trim() && name.length <= 200));
}

/** Exact published source match. Never calls a geocoding provider. */
export async function previewStoredGeocode(address: string, city: string, name: string | null) {
  const db = previewAppDataReader();
  const normalizedAddress = address.trim().toLowerCase();
  const normalizedCity = city.trim().toLowerCase();
  const normalizedName = name?.trim().toLowerCase() ?? null;
  const { results } = await db.prepare(`SELECT p.id, p.address, p.name, p.city, p.latitude, p.longitude,
    s.payload, s.publicIssue FROM spots p JOIN legacy_spot_source s ON s.spotId = p.id
    WHERE p.visible = 1 AND lower(trim(json_extract(p.address, '$.en'))) = ?
    AND lower(trim(p.city)) = ? AND (? IS NULL OR lower(trim(json_extract(p.name, '$.en'))) = ?)
    LIMIT 2`).bind(normalizedAddress, normalizedCity, normalizedName, normalizedName).all<StoredSpot>();
  if (!Array.isArray(results) || results.length > 1) throw new Error("Stored map location is ambiguous");
  const row = results[0];
  if (!row) return null;
  if (typeof row.id !== "string" || !row.id || row.publicIssue !== null
    || typeof row.city !== "string" || row.city.trim().toLowerCase() !== normalizedCity
    || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)
    || Math.abs(row.latitude!) > 90 || Math.abs(row.longitude!) > 180) {
    throw new Error("Invalid stored map location");
  }
  const parsedAddress: unknown = JSON.parse(row.address);
  const parsedName: unknown = JSON.parse(row.name);
  const source: unknown = JSON.parse(row.payload);
  if (!parsedAddress || typeof parsedAddress !== "object" || Array.isArray(parsedAddress)
    || !parsedName || typeof parsedName !== "object" || Array.isArray(parsedName)
    || !source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("Invalid stored map source");
  }
  const storedAddress = (parsedAddress as Record<string, unknown>).en;
  const storedName = (parsedName as Record<string, unknown>).en;
  const sourceRow = source as Record<string, unknown>;
  const sourceAddress = sourceRow.address && typeof sourceRow.address === "object"
    ? (sourceRow.address as Record<string, unknown>).en : null;
  const sourceName = sourceRow.name && typeof sourceRow.name === "object"
    ? (sourceRow.name as Record<string, unknown>).en : null;
  const location = sourceRow.location && typeof sourceRow.location === "object"
    ? (sourceRow.location as Record<string, unknown>).coordinates : null;
  if (sourceRow.id !== row.id || typeof storedAddress !== "string"
    || storedAddress.trim().toLowerCase() !== normalizedAddress
    || sourceAddress !== storedAddress || typeof storedName !== "string" || sourceName !== storedName
    || !Array.isArray(location) || location.length !== 2
    || typeof location[0] !== "number" || typeof location[1] !== "number"
    || Math.abs(location[0] - row.longitude!) > 0.00001
    || Math.abs(location[1] - row.latitude!) > 0.00001) {
    throw new Error("Stored map source mismatch");
  }
  return { lat: row.latitude!, lng: row.longitude!, provider: "stored" as const };
}
