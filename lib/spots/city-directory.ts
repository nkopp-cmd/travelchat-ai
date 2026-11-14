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
  /** Position in the hub's score order (0 = highest Localley Score); the list itself is A-Z. */
  rank: number;
  /** Localley Score 1-6, or null when the row has none. */
  score: number | null;
};

export type NearbyEntry = CityDirectoryEntry & { distanceKm: number };

type KeyRow = {
  id: string;
  name: unknown;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  localley_score?: number | null;
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

/** Rows (already deduped in hub score order) -> named entries sorted A-Z; rows without a name are dropped. */
export function toDirectoryEntries(rows: KeyRow[]): CityDirectoryEntry[] {
  return rows
    .map((row, rank) => ({
      id: row.id,
      name: englishName(row.name),
      category: row.category ?? null,
      lat: typeof row.latitude === "number" ? row.latitude : null,
      lng: typeof row.longitude === "number" ? row.longitude : null,
      rank,
      score: typeof row.localley_score === "number" && Number.isInteger(row.localley_score) && row.localley_score >= 1 && row.localley_score <= 6 ? row.localley_score : null,
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

/** The `limit` best-scored entries of one category (hub score order), for the hub's cafe and food picks. */
export function topPicks(entries: CityDirectoryEntry[], category: string, limit = 6): CityDirectoryEntry[] {
  if (limit <= 0) return [];
  return entries.filter((entry) => entry.category === category).sort((a, b) => a.rank - b.rank).slice(0, limit);
}

/** How many hub entries sit at each Localley Score (6 down to 1); entries without a score are not counted. */
export function scoreCounts(entries: CityDirectoryEntry[]): { score: number; count: number }[] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const entry of entries) if (entry.score !== null) counts[entry.score - 1]++;
  return counts.map((count, index) => ({ score: index + 1, count })).reverse();
}
