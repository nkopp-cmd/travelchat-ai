import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CityDirectoryEntry } from "@/lib/spots/city-directory";

// Push CB2: the full A-Z list moved off the /spots?city= hub to /spots/a-z/<city>. The hub's first paint waits for
// its whole HTML, and every spot UUID cost bytes twice (HTML + RSC payload).
const CATEGORIES = ["Cafe", "Food", "Bar", "Shopping", null] as const;
const entries: CityDirectoryEntry[] = Array.from({ length: 480 }, (_, i) => ({
  id: `${String(i).padStart(8, "0")}-aaaa-4bbb-8ccc-${String(i).padStart(12, "0")}`,
  name: `${String.fromCharCode(65 + (i % 26))}place ${i}`,
  category: CATEGORIES[i % CATEGORIES.length],
  lat: null,
  lng: null,
  rank: i,
  score: (i % 6) + 1,
}));

vi.mock("@/lib/spots/city-directory-store", () => ({ cityDirectory: async () => entries }));

const { CitySpotDirectory, CitySpotAzList, cityAzPath } = await import("@/components/spots/city-spot-directory");
const SPOT_LINK = /href="\/spots\/[0-9a-f-]{36}"/g;

describe("city spot directory payload (Push CB2)", () => {
  it("the hub links the A-Z page and holds only the pick lists, not one link per spot", async () => {
    const html = renderToStaticMarkup(await CitySpotDirectory({ citySlug: "seoul", cityName: "Seoul" }));
    expect(html).toContain(`href="${cityAzPath("seoul")}"`);
    expect(html).toContain("All 480 spots in Seoul, A–Z");
    // Two pick lists of at most 6 spots each.
    expect((html.match(SPOT_LINK) ?? []).length).toBeLessThanOrEqual(12);
    expect(html.length).toBeLessThan(8_000);
  });

  it("the A-Z page links every spot once with a short, class-free row", () => {
    const html = renderToStaticMarkup(<CitySpotAzList entries={entries} />);
    const links = html.match(SPOT_LINK) ?? [];
    expect(new Set(links).size).toBe(entries.length);
    expect(links).toHaveLength(entries.length);
    const rows = html.match(/<li>.*?<\/li>/g) ?? [];
    expect(rows).toHaveLength(entries.length);
    for (const row of rows) {
      expect(row).not.toContain("class=");
      expect(row.length).toBeLessThan(110);
    }
  });

  it("builds a safe path from the slug", () => {
    expect(cityAzPath("hong-kong")).toBe("/spots/a-z/hong-kong");
  });
});
