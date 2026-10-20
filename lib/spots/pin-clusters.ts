/** Screen-space pin clustering for the spots map (no dependency, pure). */

export interface PinPoint { id: string; x: number; y: number }
export interface PinCluster { ids: string[]; x: number; y: number }

/** Pins closer than one grid cell (in screen px) merge into one cluster at their centroid. */
export function clusterPins(points: PinPoint[], cellPx = 56, minGapPx = 44): PinCluster[] {
  const cells = new Map<string, PinPoint[]>();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const key = `${Math.floor(point.x / cellPx)}:${Math.floor(point.y / cellPx)}`;
    const cell = cells.get(key);
    if (cell) cell.push(point);
    else cells.set(key, [point]);
  }
  const merged: PinCluster[] = [];
  // Neighbouring cells can leave centroids closer than one tap target; merge those so
  // no marker covers another.
  for (const members of cells.values()) {
    let cluster: PinCluster = {
      ids: members.map((member) => member.id),
      x: members.reduce((sum, member) => sum + member.x, 0) / members.length,
      y: members.reduce((sum, member) => sum + member.y, 0) / members.length,
    };
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      const other = merged[index];
      if (Math.hypot(other.x - cluster.x, other.y - cluster.y) >= minGapPx) continue;
      const total = other.ids.length + cluster.ids.length;
      cluster = {
        ids: [...other.ids, ...cluster.ids],
        x: (other.x * other.ids.length + cluster.x * cluster.ids.length) / total,
        y: (other.y * other.ids.length + cluster.y * cluster.ids.length) / total,
      };
      merged.splice(index, 1);
    }
    merged.push(cluster);
  }
  return merged;
}

/** Keep the DOM bounded: singles first (nearest the viewport centre), then clusters, at most `max` markers. */
export function capMarkers(clusters: PinCluster[], center: { x: number; y: number }, max = 60): PinCluster[] {
  const distance = (cluster: PinCluster) => (cluster.x - center.x) ** 2 + (cluster.y - center.y) ** 2;
  return [...clusters].sort((a, b) => distance(a) - distance(b)).slice(0, max);
}

const CATEGORY_TONES = ["food", "cafe", "nightlife", "shopping", "market", "outdoor", "culture", "entertainment", "transport"] as const;
export type PinTone = (typeof CATEGORY_TONES)[number] | "other";

export function pinTone(category: string): PinTone {
  const value = category.trim().toLowerCase();
  if (value === "nature") return "outdoor";
  if (value === "historic") return "culture";
  if (value === "transportation") return "transport";
  return (CATEGORY_TONES as readonly string[]).includes(value) ? value as PinTone : "other";
}
