import { describe, expect, it } from "vitest";
import { heroCardPlace, type Box, type HeroCardInput } from "@/lib/landing/hero-card-place";

const pinAt = (x: number, y: number): Box => ({ left: x - 22, top: y - 52, right: x + 22, bottom: y + 4 });
const base: HeroCardInput = {
  anchor: { x: 240, y: 440 },
  card: { width: 208, height: 56 },
  pin: { width: 44, height: 52 },
  pins: [],
  avoid: [],
  bounds: { left: 0, top: 0, right: 390, bottom: 844 },
  order: ["below", "right", "left", "above"],
};

describe("hero card placement", () => {
  it("keeps the preferred side when it is free", () => {
    expect(heroCardPlace(base)).toEqual({ side: "below", dx: 0, dy: 10, covered: [] });
  });

  it("moves away from a pin under the card (the 390 px Euljiro case)", () => {
    const place = heroCardPlace({ ...base, pins: [pinAt(180, 520)] });
    expect(place.side).not.toBe("below");
    expect(place.covered).toEqual([]);
  });

  it("never covers the hero copy and never leaves the screen", () => {
    const place = heroCardPlace({
      ...base,
      anchor: { x: 330, y: 440 },
      pins: [pinAt(330, 520)],
      avoid: [{ left: 16, top: 300, right: 374, bottom: 380 }],
    });
    // Below covers a pin, right leaves the screen, above covers the copy: left is free.
    expect(place.side).toBe("left");
    expect(place.covered).toEqual([]);
  });

  it("when every side covers a pin, takes the fewest and returns them to hide", () => {
    const place = heroCardPlace({
      ...base,
      pins: [pinAt(240, 520), pinAt(400 - 20, 410), pinAt(80, 410), pinAt(240, 330), pinAt(160, 330)],
    });
    expect(place.covered.length).toBe(1);
  });

  it("slides inside the screen instead of covering the copy when the pin sits at the edge (768 px case)", () => {
    const lines: Box[] = [
      { left: 24, top: 282, right: 470, bottom: 314 },
      { left: 24, top: 332, right: 578, bottom: 388 },
      { left: 24, top: 392, right: 273, bottom: 448 },
      { left: 24, top: 472, right: 525, bottom: 500 },
    ];
    const bounds = { left: 0, top: 64, right: 758, bottom: 1024 };
    const place = heroCardPlace({
      ...base,
      anchor: { x: 751, y: 393 },
      bounds,
      pins: [pinAt(521, 500)],
      avoid: lines,
      order: ["above", "right", "left", "below"],
    });
    const left = 751 + place.dx - 104;
    expect(place.side).toBe("below");
    expect(left + 208).toBeLessThanOrEqual(bounds.right - 8);
    expect(lines.some((line) => left < line.right && left + 208 > line.left && 393 + place.dy < line.bottom && 393 + place.dy + 56 > line.top)).toBe(false);
  });
});

