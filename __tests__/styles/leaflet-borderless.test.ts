import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("Leaflet zoom control", () => {
  it("drops Leaflet's default borders with a selector that outranks leaflet.css", () => {
    expect(rule(".leaflet-container .leaflet-bar")).toMatch(/border: 0;/);
    expect(rule(".leaflet-container .leaflet-bar a,\n.leaflet-container .leaflet-bar a:last-child")).toMatch(/border: 0;/);
  });

  it("keeps zoom buttons at the 44px tap-target minimum", () => {
    const button = rule(".leaflet-container .leaflet-bar a,\n.leaflet-container .leaflet-bar a:last-child");
    expect(button).toMatch(/width: 44px;/);
    expect(button).toMatch(/height: 44px;/);
  });
});
