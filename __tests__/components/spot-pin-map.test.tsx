import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => ({ default: {} }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
import { PinCard } from "@/components/spots/spot-pin-map";
import type { Spot } from "@/types";

const spot = {
  id: "550e8400-e29b-41d4-a716-446655440000", name: "Dongmyo Flea Market", description: "",
  location: { lat: 37.57, lng: 127.01, address: "Jongno" }, areaName: "Jongno", category: "Market",
  subcategories: [], localleyScore: 5, localPercentage: 80, bestTime: "", tips: [], verified: true, trending: true,
  photos: ["/api/places/photo?name=places%2Fabc%2Fphotos%2Fdef"],
} as unknown as Spot;

describe("map pin card", () => {
  it("is a labelled dialog with Details and Close, and Escape closes it", () => {
    const onClose = vi.fn();
    render(<PinCard spot={spot} point={{ x: 120, y: 300 }} titleId="pin-title" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Dongmyo Flea Market" });
    expect(document.activeElement).toBe(dialog);
    expect(screen.getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/spots/${spot.id}`);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Close spot card" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("never renders a paid Google photo proxy URL; it falls back to the category tile", () => {
    const { container } = render(<PinCard spot={spot} point={{ x: 0, y: 0 }} titleId="t" onClose={() => {}} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-tone="market"]')).not.toBeNull();
  });

  it("uses a stored first-party photo when the spot has one", () => {
    const withPhoto = { ...spot, photos: ["https://media.localley.io/spots/dongmyo-128.webp"] } as Spot;
    const { container } = render(<PinCard spot={withPhoto} point={{ x: 0, y: 0 }} titleId="t" onClose={() => {}} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://media.localley.io/spots/dongmyo-128.webp");
  });

  it("keeps the pin layer off paid photo APIs and borders", () => {
    const source = readFileSync("components/spots/spot-pin-map.tsx", "utf8");
    expect(source).not.toMatch(/\/api\/(spots\/[^"']*\/photos|places\/photo)/);
    expect(source).not.toMatch(/useVenuePhotos|fetch\(/);
    const css = readFileSync("app/globals.css", "utf8");
    const pinCss = css.slice(css.indexOf("/* Map photo pins"));
    expect(pinCss).not.toMatch(/border:\s*[1-9]|0 0 0 [1-9]px/);
    expect(pinCss).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.ll-pin-card \{ animation: none; \}/);
    expect(pinCss).toMatch(/max-width: 639px\)[\s\S]*\.ll-pin-map\[data-card-open\] \.leaflet-control-zoom \{ visibility: hidden; \}/);
    expect(source).toMatch(/data-card-open=\{selected \? "" : undefined\}/);
  });
});
