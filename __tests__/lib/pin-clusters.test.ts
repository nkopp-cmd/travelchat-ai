import { describe, expect, it } from "vitest";
import { capMarkers, clusterPins, pinTone } from "@/lib/spots/pin-clusters";

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

  it("bounds the marker count, nearest the centre first", () => {
    const many = Array.from({ length: 100 }, (_, index) => ({ ids: [String(index)], x: index * 100, y: 0 }));
    const kept = capMarkers(many, { x: 0, y: 0 }, 60);
    expect(kept).toHaveLength(60);
    expect(kept[0].ids).toEqual(["0"]);
    expect(kept.at(-1)?.ids).toEqual(["59"]);
  });

  it("maps catalog categories to a bounded tone set", () => {
    expect(pinTone("Food")).toBe("food");
    expect(pinTone(" Nature ")).toBe("outdoor");
    expect(pinTone("Historic")).toBe("culture");
    expect(pinTone("Transportation")).toBe("transport");
    expect(pinTone("<script>")).toBe("other");
  });
});
