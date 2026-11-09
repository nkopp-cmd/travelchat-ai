/** Screen-space pin clustering for the spots map (no dependency, pure). */

export interface PinPoint { id: string; x: number; y: number }
export interface PinCluster { ids: string[]; x: number; y: number }

/** Clusters every pin except the selected one, which always stays a single pin under its card. */
export function clusterKeepingSelected(points: PinPoint[], selectedId: string | null, cellPx = 56, minGapPx = 44): PinCluster[] {
  const selected = selectedId ? points.find((point) => point.id === selectedId) : undefined;
  if (!selected) return clusterPins(points, cellPx, minGapPx);
  const rest = clusterPins(points.filter((point) => point.id !== selectedId), cellPx, minGapPx);
  return [...rest, { ids: [selected.id], x: selected.x, y: selected.y }];
}

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

/**
 * Keep the DOM bounded without dropping pins: when there are more than `max` markers, cluster again with a
 * larger cell until they fit, so every pin in view still counts in exactly one marker.
 */
export function clusterBounded(points: PinPoint[], selectedId: string | null, cellPx: number, minGapPx: number, max = 60): PinCluster[] {
  let cell = cellPx;
  let gap = minGapPx;
  let clusters = clusterKeepingSelected(points, selectedId, cell, gap);
  while (clusters.length > max && cell < 1e6) {
    cell = Math.max(cell * 1.6, 40);
    gap = Math.max(gap * 1.6, 34);
    clusters = clusterKeepingSelected(points, selectedId, cell, gap);
  }
  return clusters;
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
