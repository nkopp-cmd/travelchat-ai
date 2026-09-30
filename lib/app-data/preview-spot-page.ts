import "server-only";
import { previewAppDataReader } from "./preview-db";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

interface SpotRow {
  id: string; name: string; description: string; address: string; category: string;
  localley_score: number | null; photos: string | null; latitude: number | null;
  longitude: number | null; city: string | null;
}

function localized(value: string): string {
  if (!value.trim()) return "";
  if (!value.trim().startsWith("{")) return value;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid spot text");
  const text = (parsed as Record<string, unknown>).en ?? Object.values(parsed)[0];
  if (typeof text !== "string") throw new Error("Invalid spot translation");
  return text;
}

/** A bounded preview page read. Normalized D1 visibility is the publication gate. */
export async function previewSpotPageData(id: string) {
  if (!uuid.test(id)) return null;
  const row = await previewAppDataReader().prepare(`SELECT id, name, description, address,
    category, localley_score, photos, latitude, longitude, city FROM spots
    WHERE id = ? AND visible = 1 LIMIT 1`).bind(id.toLowerCase()).first<SpotRow>();
  if (!row) return null;
  if (row.id !== id.toLowerCase() || !row.category || row.category.length > 100
    || (row.latitude !== null && (!Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90))
    || (row.longitude !== null && (!Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180))
    || (row.localley_score !== null && (!Number.isFinite(row.localley_score)
      || row.localley_score < 1 || row.localley_score > 6))) throw new Error("Invalid preview spot");
  const name = localized(row.name), description = localized(row.description), address = localized(row.address);
  const photos: unknown = row.photos === null ? [] : JSON.parse(row.photos);
  if (!name || !description || !address || !Array.isArray(photos) || photos.length > 20
    || photos.some(photo => typeof photo !== "string" || photo.length > 2048)) {
    throw new Error("Invalid preview spot detail");
  }
  return { id: row.id, name, description, address, category: row.category,
    score: row.localley_score, photos: photos as string[], lat: row.latitude,
    lng: row.longitude, city: row.city };
}
