import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", async () => {
  const { readFileSync: read } = await import("node:fs");
  const { version } = JSON.parse(read("node_modules/maplibre-gl/package.json", "utf8")) as { version: string };
  return { getVersion: () => version };
});
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
import { PinCard, PinFace, SWIPE_CLOSE_PX, fitCore, maplibreWorkerUrl } from "@/components/spots/spot-pin-map";
import type { Spot } from "@/types";
import { CARD_PHOTO_WIDTH } from "@/lib/spots/own-photo";

const spot = {
  id: "550e8400-e29b-41d4-a716-446655440000", name: "Dongmyo Flea Market", description: "",
  location: { lat: 37.57, lng: 127.01, address: "Jongno" }, areaName: "Jongno", category: "Market",
  subcategories: [], localleyScore: 5, localPercentage: 80, bestTime: "", tips: [], verified: true, trending: true,
  photos: ["/api/places/photo?name=places%2Fabc%2Fphotos%2Fdef"],
} as unknown as Spot;

describe("maplibre worker", () => {
  it("points at the versioned worker copied to public/ by the build", async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("node", ["scripts/copy-maplibre-worker.mjs"]);
    const maplibreVersion = (JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8")) as { version: string }).version;
    expect(maplibreWorkerUrl()).toBe(`/vendor/maplibre-gl-worker-${maplibreVersion}.mjs`);
    expect(readFileSync(`public${maplibreWorkerUrl()}`, "utf8")).toContain("MapLibre GL JS");
  });
});

describe("map pin card", () => {
  it("is a labelled dialog with Details and Close, and Escape closes it", () => {
    const onClose = vi.fn();
    render(<PinCard spot={spot} point={{ x: 120, y: 300 }} titleId="pin-title" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Dongmyo Flea Market" });
    expect(document.activeElement).toBe(dialog);
    expect(screen.getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/spots/${spot.id}`);
    expect(screen.getByText("· Hidden Gem")).toBeTruthy(); // score 5 on the real 1-6 scale, never a bare number
    expect(screen.queryByText(/Localley score/)).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close spot card" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the stored Google photo at the card width (one shared URL), and the tile when it fails", () => {
    const { container } = render(<PinCard spot={spot} point={{ x: 0, y: 0 }} titleId="t" onClose={() => {}} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(`/api/places/photo?name=places%2Fabc%2Fphotos%2Fdef&w=${CARD_PHOTO_WIDTH}`);
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-tone="market"]')).not.toBeNull();
  });

  it("falls back to the category tile when the spot has no stored photo", () => {
    const { container } = render(<PinCard spot={{ ...spot, photos: [] } as Spot} point={{ x: 0, y: 0 }} titleId="t" onClose={() => {}} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-tone="market"]')).not.toBeNull();
  });

  it("uses a stored first-party photo when the spot has one", () => {
    const withPhoto = { ...spot, photos: ["https://media.localley.io/spots/dongmyo-128.webp"] } as Spot;
    const { container } = render(<PinCard spot={withPhoto} point={{ x: 0, y: 0 }} titleId="t" onClose={() => {}} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://media.localley.io/spots/dongmyo-128.webp");
  });

  it("leads with the spot's own R2 photo (harvested or tip) before the Google photo", () => {
    const own = `/media/spot/${"1".repeat(8)}-0000-4000-8000-${"0".repeat(12)}/${"a".repeat(64)}.webp`;
    const { container } = render(<PinCard spot={{ ...spot, ownPhoto: own } as Spot} point={{ x: 0, y: 0 }} titleId="t" onClose={() => {}} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(own.replace(/\.webp$/, "-w480.webp"));
  });

  it("a pin face loads the 144 px pin copy of the own photo, the card keeps the 480 px copy", () => {
    const own = `/media/spot/${"1".repeat(8)}-0000-4000-8000-${"0".repeat(12)}/${"a".repeat(64)}.webp`;
    const { container } = render(<PinFace spot={{ ...spot, ownPhoto: own } as Spot} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(own.replace(/\.webp$/, "-w144.webp"));
  });

  it("keeps the pin layer off Place Details calls and borders", () => {
    const source = readFileSync("components/spots/spot-pin-map.tsx", "utf8");
    expect(source).not.toMatch(/\/api\/(spots\/[^"']*\/photos|places\/photo)/);
    expect(source).not.toMatch(/useVenuePhotos|fetch\(/);
    const css = readFileSync("app/globals.css", "utf8");
    const pinCss = css.slice(css.indexOf("/* Map photo pins"));
    expect(pinCss).not.toMatch(/border:\s*[1-9]|0 0 0 [1-9]px/);
    expect(pinCss).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.ll-pin-card, \.ll-pin-card\[data-expanded\] \{ animation: none; \}/);
    expect(pinCss).toMatch(/max-width: 639px\)[\s\S]*\.ll-pin-map\[data-card-open\] \.maplibregl-ctrl-top-left \{ visibility: hidden; \}/);
    expect(source).toMatch(/data-card-open=\{selected \? "" : undefined\}/);
  });

  it("draws a group as stacked photo dots and shows category chips from zoom 15", () => {
    const source = readFileSync("components/spots/spot-pin-map.tsx", "utf8");
    expect(source).toMatch(/const NEAR_ZOOM = 15;/);
    expect(source).toMatch(/slot\.ids\.slice\(1, 3\)/);
    expect(source).toMatch(/className="ll-pin-stack" data-depth=\{index \+ 1\}/);
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.ll-pin-stack \.ll-pin-face::after \{ display: none; \}/);
    expect(css).toMatch(/\.ll-pin-stack\[data-depth="2"\]/);
  });

  it("draws pins once per frame and keeps markers whose group is unchanged (mobile TBT)", () => {
    const source = readFileSync("components/spots/spot-pin-map.tsx", "utf8");
    expect(source).toMatch(/if \(!drawFrameRef\.current\) drawFrameRef\.current = requestAnimationFrame\(drawNow\);/);
    expect(source).toMatch(/const old = live\.get\(key\);[\s\S]*old\.marker\.setLngLat\(at\);[\s\S]*return old\.slot;/);
    expect(source).not.toMatch(/for \(const marker of markersRef\.current\) marker\.remove\(\);/);
  });

  it("expands to the detail in place and Escape steps back detail -> card -> closed", () => {
    const onClose = vi.fn();
    const rich = { ...spot, description: "Saturday flea market with vinyl and vintage.", bestTime: "Saturday morning",
      tips: ["Bring cash", "  ", "Go before 10"] } as unknown as Spot;
    const { container } = render(<PinCard spot={rich} point={{ x: 120, y: 300 }} titleId="detail-title" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Dongmyo Flea Market" });
    const more = screen.getByRole("button", { name: "More about this spot" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    // The card previews the description in two lines (reference layout); the detail shows it whole.
    expect(screen.getByText("Saturday flea market with vinyl and vintage.").className).toContain("line-clamp-2");
    expect(screen.queryByText("Best time: Saturday morning")).toBeNull();
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
    expect(dialog.hasAttribute("data-expanded")).toBe(true);
    expect(screen.getByText("Saturday flea market with vinyl and vintage.").className).not.toContain("line-clamp");
    expect(screen.getByText("Best time: Saturday morning")).toBeTruthy();
    expect(container.querySelectorAll("li")).toHaveLength(2);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog.hasAttribute("data-expanded")).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows an itinerary stop without a catalog link or score when the stop has no spot page", () => {
    const itineraryStop = {
      id: "day1-0", name: "Hawker Breakfast", category: "Food", photos: [],
      location: { lat: 1.29, lng: 103.85, address: "" }, meta: "Day 1 · 9:00 AM", href: null,
      stop: { label: "1", color: "#7c3aed", ariaPrefix: "Day 1, stop 1" },
    };
    render(<PinCard spot={itineraryStop} point={{ x: 120, y: 300 }} titleId="stop-title" onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Hawker Breakfast" })).toBeTruthy();
    expect(screen.getByText("Day 1 · 9:00 AM")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Details" })).toBeNull();
    expect(screen.queryByText(/Hidden Gem|Localley score/)).toBeNull();
  });
});


describe("phone bottom card (mobile map item 3)", () => {
  it("closes on a downward swipe, not on a short drag", () => {
    const onClose = vi.fn();
    render(<PinCard spot={spot} point={{ x: 120, y: 300 }} titleId="swipe-title" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Dongmyo Flea Market" });
    fireEvent.pointerDown(dialog, { clientY: 500 });
    fireEvent.pointerUp(dialog, { clientY: 520 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(dialog, { clientY: 500 });
    fireEvent.pointerUp(dialog, { clientY: 500 + SWIPE_CLOSE_PX });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("is a compact bottom card below lg: thumb left, no Close button or long preview, and a map tap closes it", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const phone = css.slice(css.indexOf("@media (max-width: 1023px) {\n    .ll-pin-card:not([data-expanded])"));
    expect(phone).toMatch(/grid-template-columns: 72px minmax\(0, 1fr\);/);
    expect(phone).toMatch(/\.ll-pin-card-media \{[^}]*width: 72px;[^}]*height: 72px;/);
    expect(phone).toMatch(/bottom: calc\(12px \+ var\(--ll-map-bottom-inset, 0px\)\);/);
    expect(phone).toMatch(/\.ll-pin-card-wide \{ display: none; \}/);
    render(<PinCard spot={spot} point={{ x: 0, y: 0 }} titleId="t2" onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Close spot card" }).className).toContain("ll-pin-card-wide");
    const source = readFileSync("components/spots/spot-pin-map.tsx", "utf8");
    expect(source).toMatch(/if \(event\.originalEvent\?\.target === loadedMap\.getCanvas\(\)\) close\(\);/);
  });
});

describe("fitCore", () => {
    const seoul: [number, number][] = Array.from({ length: 40 }, (_, i) => [126.95 + (i % 8) * 0.01, 37.53 + Math.floor(i / 8) * 0.01]);

    it("drops a few far outliers so a city map opens on the city", () => {
        const busan: [number, number] = [129.16, 35.16];
        const daejeon: [number, number] = [127.4, 36.31];
        const core = fitCore([...seoul, busan, daejeon]);
        expect(core).toHaveLength(40);
        expect(core).not.toContainEqual(busan);
    });

    it("keeps every point when far points are not rare (a multi-city map)", () => {
        const tokyo: [number, number][] = seoul.slice(0, 20).map(([lng, lat]) => [lng + 12.8, lat - 1.85]);
        expect(fitCore([...seoul, ...tokyo])).toHaveLength(60);
    });

    it("keeps small sets as they are", () => {
        expect(fitCore([[126.9, 37.5], [129.1, 35.1]])).toHaveLength(2);
    });
});
