import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DARK_MAP_TOKENS, MAP_ATTRIBUTION, localleyMapStyle, readMapTokens, tone } from "@/lib/maps/localley-map-style";

describe("Localley map style", () => {
  const style = localleyMapStyle();
  const layers = style.layers;

  it("uses free OpenFreeMap vector tiles and glyphs, with OSM attribution", () => {
    expect(style.sources.openmaptiles).toMatchObject({ type: "vector", url: "https://tiles.openfreemap.org/planet" });
    expect(style.glyphs).toMatch(/^https:\/\/tiles\.openfreemap\.org\/fonts\//);
    expect(MAP_ATTRIBUTION).toMatch(/openstreetmap\.org\/copyright/);
    expect(JSON.stringify(style)).not.toMatch(/api[_-]?key|access_token|mapbox\.com/i);
  });

  it("has no POI or icon layers: the photo pins are the points of interest", () => {
    expect(layers.some((layer) => "source-layer" in layer && layer["source-layer"] === "poi")).toBe(false);
    expect(JSON.stringify(layers)).not.toMatch(/icon-image/);
    expect(style.sprite).toBeUndefined();
  });

  it("draws in the Localley tokens", () => {
    const background = layers.find((layer) => layer.id === "background");
    expect(background?.paint).toEqual({ "background-color": tone(DARK_MAP_TOKENS.background, DARK_MAP_TOKENS.surface, 0.55) });
    expect(tone("0 0 0", "100 200 50", 0.5)).toBe("rgb(50, 100, 25)");
    expect(tone("10 20 30", "10 20 30", 0, 0.5)).toBe("rgba(10, 20, 30, 0.5)");
  });

  it("labels places in English with the local script below", () => {
    const city = layers.find((layer) => layer.id === "place-city");
    expect(JSON.stringify(city)).toContain('"name:nonlatin"');
    expect(JSON.stringify(city)).toContain('"name:en"');
  });

  it("reads live --ll-* tokens and ignores malformed values", () => {
    const element = document.createElement("div");
    element.style.setProperty("--ll-background", "1 2 3");
    element.style.setProperty("--ll-surface", "not a colour");
    document.body.append(element);
    const tokens = readMapTokens(element);
    expect(tokens.background).toBe("1 2 3");
    expect(tokens.surface).toBe(DARK_MAP_TOKENS.surface);
    expect(readMapTokens(null)).toEqual(DARK_MAP_TOKENS);
    element.remove();
  });

  it("keeps the dark defaults in step with the borderless tokens", () => {
    const css = readFileSync("styles/borderless-tokens.css", "utf8");
    expect(css).toContain(`--ll-background: ${DARK_MAP_TOKENS.background};`);
    expect(css).toContain(`--ll-surface: ${DARK_MAP_TOKENS.surface};`);
    expect(css).toContain(`--ll-muted: ${DARK_MAP_TOKENS.muted};`);
  });

  it("styles MapLibre's zoom buttons borderless at the 44px tap target", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const button = css.slice(css.indexOf(".ll-pin-map .maplibregl-ctrl-group button {"));
    expect(button.slice(0, button.indexOf("}"))).toMatch(/width: 44px;[\s\S]*height: 44px;[\s\S]*border: 0;/);
    expect(css).not.toMatch(/ll-map-tiles/);
  });
});
