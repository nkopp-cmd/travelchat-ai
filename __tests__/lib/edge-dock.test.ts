import { describe, expect, it } from "vitest";
import { dockPoint, dockRect, edgeDock } from "@/lib/spots/edge-dock";

// A 390 x 700 phone map: rect 8..382 x 8..692 with the sheet closed.
const RECT = dockRect(390, 700);
const FADE = 390 * 1.5;

describe("edge dock", () => {
  it("keeps places inside the visible map undocked", () => {
    expect(dockPoint({ x: 200, y: 300 }, RECT)).toBeNull();
    expect(edgeDock([{ id: "a", x: 10, y: 690 }], RECT, { fadeOut: FADE })).toEqual([]);
  });

  it("docks on the side the place left, on the line from the centre", () => {
    // Straight right of the centre (195, 350) -> right edge, same y.
    expect(dockPoint({ x: 600, y: 350 }, RECT)).toEqual({ x: 382, y: 350 });
    // Straight above -> top edge, same x.
    expect(dockPoint({ x: 195, y: -400 }, RECT)).toEqual({ x: 195, y: 8 });
    // Up and to the left: the line meets the left side first (wide offset, small rise).
    const left = dockPoint({ x: -400, y: 200 }, RECT)!;
    expect(left.x).toBe(8);
    expect(left.y).toBeGreaterThan(200);
    expect(left.y).toBeLessThan(350);
  });

  it("docks into the corner for a place on the diagonal", () => {
    // Centre (195, 350); the corner (382, 692) lies on the ray through (569, 1034).
    const corner = dockPoint({ x: 569, y: 1034 }, RECT)!;
    expect(corner.x).toBeCloseTo(382, 6);
    expect(corner.y).toBeCloseTo(692, 6);
  });

  it("moves bottom dots above an open sheet", () => {
    const sheet = dockRect(390, 700, { bottom: 320 });
    expect(sheet.bottom).toBe(372);
    const dot = dockPoint({ x: 195, y: 900 }, sheet)!;
    expect(dot).toEqual({ x: 195, y: 372 });
    // A place behind the sheet (visible on the map but covered) is docked too.
    expect(dockPoint({ x: 195, y: 500 }, sheet)).toEqual({ x: 195, y: 372 });
  });

  it("orders nearest first, keeps at most 12 and drops places past the fade distance", () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ id: `p${String(i).padStart(2, "0")}`, x: 400 + i * 10, y: 350 }));
    points.push({ id: "far", x: 382 + FADE + 1, y: 350 });
    const dots = edgeDock(points, RECT, { fadeOut: FADE });
    expect(dots).toHaveLength(12);
    expect(dots[0].id).toBe("p00");
    expect(dots.map((dot) => dot.distance)).toEqual([...dots.map((dot) => dot.distance)].sort((a, b) => a - b));
    expect(dots.some((dot) => dot.id === "far")).toBe(false);
  });

  it("fades from full strength at half the distance to zero at the limit", () => {
    const [near, mid, edge] = edgeDock([
      { id: "near", x: 382 + 50, y: 350 },
      { id: "mid", x: 382 + FADE * 0.75, y: 350 },
      { id: "edge", x: 382 + FADE, y: 350 },
    ], RECT, { fadeOut: FADE });
    expect(near.opacity).toBe(1);
    expect(mid.opacity).toBeCloseTo(0.5, 6);
    expect(edge.opacity).toBe(0);
  });

  it("never stacks two dots closer than the gap; the nearer place wins", () => {
    const dots = edgeDock([
      { id: "near", x: 420, y: 350 },
      { id: "behind", x: 900, y: 352 },
      { id: "other", x: 420, y: 500 },
    ], RECT, { fadeOut: FADE, minGap: 22 });
    expect(dots.map((dot) => dot.id)).toEqual(["near", "other"]);
  });
});
