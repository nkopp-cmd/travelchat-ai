import { getSpotDistanceKm, hasUsableSpotCoordinate } from "./proximity";

/**
 * One light row per public spot of a city hub: the hub's A-Z list links every row, and each spot page links its
 * nearest rows. Together they leave no sitemap spot without an internal link (L3, weekend-sprint-20261114).
 */
export type CityDirectoryEntry = {
  id: string;
  name: string;
  category: string | null;
  lat: number | null;
  lng: number | null;
};

export type NearbyEntry = CityDirectoryEntry & { distanceKm: number };

type KeyRow = {
  id: string;
  name: unknown;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function englishName(name: unknown): string {
  if (typeof name === "string") return name.trim();
  if (name && typeof name === "object") {
    const record = name as Record<string, unknown>;
    const value = typeof record.en === "string" && record.en.trim() ? record.en : Object.values(record).find((v) => typeof v === "string" && v.trim());
    return typeof value === "string" ? value.trim() : "";
  }
  return "";
}

/** Rows (already deduped in hub order) -> named entries sorted A-Z; rows without a name are dropped. */
export function toDirectoryEntries(rows: KeyRow[]): CityDirectoryEntry[] {
  return rows
    .map((row) => ({
      id: row.id,
      name: englishName(row.name),
      category: row.category ?? null,
      lat: typeof row.latitude === "number" ? row.latitude : null,
      lng: typeof row.longitude === "number" ? row.longitude : null,
    }))
    .filter((entry) => entry.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

/** The `limit` closest entries to `origin` with coordinates, never the excluded ids; ties keep A-Z order. */
export function nearestEntries(
  entries: CityDirectoryEntry[],
  origin: { lat: number; lng: number },
  exclude: Iterable<string>,
  limit = 6,
): NearbyEntry[] {
  if (!hasUsableSpotCoordinate(origin.lat, origin.lng) || limit <= 0) return [];
  const skip = new Set(Array.from(exclude, (id) => id.toLowerCase()));
  const withDistance: NearbyEntry[] = [];
  for (const entry of entries) {
    if (skip.has(entry.id.toLowerCase()) || entry.lat === null || entry.lng === null) continue;
    const distanceKm = getSpotDistanceKm(origin, { lat: entry.lat, lng: entry.lng });
    if (distanceKm !== null) withDistance.push({ ...entry, distanceKm });
  }
  return withDistance.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

/** A-Z groups for the hub list: "A".."Z", then "#" for names that start with anything else. */
export function groupByInitial(entries: CityDirectoryEntry[]): { letter: string; entries: CityDirectoryEntry[] }[] {
  const groups = new Map<string, CityDirectoryEntry[]>();
  for (const entry of entries) {
    const first = entry.name.normalize("NFD").charAt(0).toUpperCase();
    const letter = /^[A-Z]$/.test(first) ? first : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
    .map(([letter, list]) => ({ letter, entries: list }));
}
