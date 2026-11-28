import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Push EM1: a spot page that misses the edge cache must not read the spot twice in series
// (generateMetadata blocks the first byte, then the page read it again).
const source = readFileSync(join(process.cwd(), "app", "spots", "[id]", "page.tsx"), "utf8");

describe("spot page reads (EM1)", () => {
  it("shares one spot read per request between metadata and page", () => {
    expect(source).toMatch(/const getSpot = cache\(readSpot\);/);
    expect(source).not.toMatch(/async function getSpot\(/);
  });

  it("starts the id-only reads before the metadata awaits the spot", () => {
    const meta = source.slice(source.indexOf("export async function generateMetadata"), source.indexOf("export default async function SpotPage"));
    const prefetch = meta.indexOf("prefetchSpotReads(id)");
    expect(prefetch).toBeGreaterThan(-1);
    expect(prefetch).toBeLessThan(meta.indexOf("await getSpot("));
  });

  it("the page reuses the cached id-only reads", () => {
    const page = source.slice(source.indexOf("export default async function SpotPage"));
    for (const read of ["spotGuide(spot.id)", "spotViralMentions(spot.id)", "indexRows()", "plannerCityNames()"]) {
      expect(page).toContain(read);
    }
    expect(page).not.toContain("sitemapSpotRows()");
    expect(page).not.toContain("fetchSpotViralMentions(");
  });
});
