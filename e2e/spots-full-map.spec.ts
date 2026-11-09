import { expect, test } from "@playwright/test";
import { decodePinIndex, type PinIndex } from "../lib/spots/pin-index";
import { pinMap } from "./pin-map";

// shared/plans/localley-full-map.md item 4: the map shows every visible spot of the filter, not one list page.
// PLAYWRIGHT_D1_PIN_COUNTS='{"all":N,"tokyo":M}' comes from scripts/e2e/d1-pin-counts.ts (read-only D1);
// without it the test still proves map pins = pin index = the map's own total.
const d1Counts = process.env.PLAYWRIGHT_D1_PIN_COUNTS
  ? JSON.parse(process.env.PLAYWRIGHT_D1_PIN_COUNTS) as Record<string, number>
  : null;

for (const filter of [{ name: "all", query: "" }, { name: "tokyo", query: "&city=tokyo" }] as const) {
  test(`full map pins = D1 count (${filter.name})`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route((url) => decodeURIComponent(url.href).includes("/api/places/photo") || url.hostname === "places.googleapis.com",
      (route) => route.abort("blockedbyclient"));

    const indexResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/spots/pins");
    await page.goto(`/spots?view=map${filter.query}`, { waitUntil: "domcontentloaded" });
    const index = await (await indexResponse).json() as PinIndex;
    const indexKeys = decodePinIndex(index).map((pin) => pin.key);
    expect(new Set(indexKeys).size).toBe(indexKeys.length);

    const map = pinMap(page.getByRole("region", { name: "Discovery map", exact: true }));
    await expect(map).toHaveAttribute("data-pin-total", String(indexKeys.length));
    await expect(page.getByText(`${indexKeys.length.toLocaleString("en-US")} spots on the map`)).toBeVisible();

    // At the fit-all view every pin is a single pin or inside one count bubble, each exactly once.
    await expect.poll(() => map.evaluate((element) => {
      const ids = [
        ...[...element.querySelectorAll("[data-pin-id]")].map((pin) => pin.getAttribute("data-pin-id") || ""),
        ...[...element.querySelectorAll("[data-pin-ids]")].flatMap((group) => (group.getAttribute("data-pin-ids") || "").split(" ")),
      ];
      return { total: ids.length, unique: new Set(ids).size };
    }), { timeout: 30_000 }).toEqual({ total: indexKeys.length, unique: indexKeys.length });

    if (d1Counts) expect(indexKeys.length, "pins on the map = visible D1 spots with coordinates").toBe(d1Counts[filter.name]);
    await testInfo.attach("pin-count", { body: JSON.stringify({ filter: filter.name, pins: indexKeys.length, d1: d1Counts?.[filter.name] ?? null }), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath(`full-map-${filter.name}.png`) });
  });
}
