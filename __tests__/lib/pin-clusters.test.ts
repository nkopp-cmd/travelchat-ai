import { describe, expect, it } from "vitest";
import { clusterBounded, clusterKeepingSelected, clusterPins, pinTone } from "@/lib/spots/pin-clusters";

describe("spot pin clustering", () => {
  it("merges pins in the same screen cell and keeps distant pins single", () => {
    const clusters = clusterPins([
      { id: "a", x: 10, y: 10 }, { id: "b", x: 30, y: 20 }, { id: "c", x: 200, y: 200 },
      { id: "bad", x: Number.NaN, y: 4 },
    ]);
    expect(clusters).toEqual([{ ids: ["a", "b"], x: 20, y: 15 }, { ids: ["c"], x: 200, y: 200 }]);
  });

  it("merges clusters from neighbouring cells that would overlap on screen", () => {
    const clusters = clusterPins([{ id: "a", x: 54, y: 10 }, { id: "b", x: 58, y: 12 }, { id: "c", x: 300, y: 300 }]);
    expect(clusters.map((cluster) => cluster.ids.sort())).toEqual([["a", "b"], ["c"]]);
    const all = clusterPins(Array.from({ length: 50 }, (_, index) => ({ id: String(index), x: index * 7, y: (index % 5) * 9 })));
    for (const [index, cluster] of all.entries()) {
      for (const other of all.slice(index + 1)) expect(Math.hypot(cluster.x - other.x, cluster.y - other.y)).toBeGreaterThanOrEqual(44);
    }
    expect(all.flatMap((cluster) => cluster.ids)).toHaveLength(50);
  });

  it("bounds the marker count by clustering coarser, never by dropping pins", () => {
    const many = Array.from({ length: 3000 }, (_, index) => ({ id: String(index), x: (index * 37) % 1400, y: (index * 53) % 900 }));
    const clusters = clusterBounded(many, "7", 40, 34, 60);
    expect(clusters.length).toBeLessThanOrEqual(60);
    const ids = clusters.flatMap((cluster) => cluster.ids);
    expect(ids).toHaveLength(3000);
    expect(new Set(ids).size).toBe(3000);
    expect(clusters.some((cluster) => cluster.ids.length === 1 && cluster.ids[0] === "7")).toBe(true);
  });

  it("maps catalog categories to a bounded tone set", () => {
    expect(pinTone("Food")).toBe("food");
    expect(pinTone(" Nature ")).toBe("outdoor");
    expect(pinTone("Historic")).toBe("culture");
    expect(pinTone("Transportation")).toBe("transport");
    expect(pinTone("<script>")).toBe("other");
  });

  it("never merges the selected pin into a group", () => {
    const points = [{ id: "a", x: 10, y: 10 }, { id: "b", x: 12, y: 12 }, { id: "c", x: 14, y: 11 }];
    expect(clusterPins(points, 56, 44)).toHaveLength(1);
    const kept = clusterKeepingSelected(points, "b", 56, 44);
    expect(kept).toContainEqual({ ids: ["b"], x: 12, y: 12 });
    expect(kept.flatMap((cluster) => cluster.ids).sort()).toEqual(["a", "b", "c"]);
    expect(clusterKeepingSelected(points, null, 56, 44)).toEqual(clusterPins(points, 56, 44));
    expect(clusterKeepingSelected(points, "gone", 56, 44)).toEqual(clusterPins(points, 56, 44));
  });
});
