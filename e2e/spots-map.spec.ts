import { expect, test } from "@playwright/test";
import { expectPinCard, expectTilesRendered, firstClickablePin, openListSheet, pinMap, pinOrGroupOf, selectedListTitle, pinName, pinnedTotal, singlePins } from "./pin-map";

const requireSeoulPins = process.env.PLAYWRIGHT_REQUIRE_SEOUL_PINS === "1";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "intermediate", width: 900, height: 1000 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

for (const viewport of viewports) {
  test(`real Seoul map: toggle, filters, and selection at ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(60_000);
    await page.setViewportSize(viewport);
    // Block billable photo proxies, including requests through Next's image optimizer.
    // No responses or spot data are fabricated.
    await page.route((url) => decodeURIComponent(url.href).includes("/api/places/photo") || url.hostname === "places.googleapis.com", (route) => route.abort("blockedbyclient"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    try {
      await page.goto("/spots?city=seoul&view=map", { waitUntil: "domcontentloaded" });
      const mapToggle = page.getByRole("button", { name: "Map view", exact: true });
      await expect(mapToggle).toHaveAttribute("aria-pressed", "true");
      const discovery = page.getByRole("region", { name: "Discovery map", exact: true });
      const empty = page.getByRole("heading", { name: "No spots found", exact: true });
      await expect(discovery.or(empty)).toBeVisible();
      if (requireSeoulPins) {
        await expect(discovery, "Strict real-map check requires Seoul results").toBeVisible();
        await expect(singlePins(pinMap(discovery)).first(), "Strict real-map check requires a usable Seoul pin").toBeVisible();
      }
      await mapToggle.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("initial-map.png") });

      if (await discovery.isVisible()) {
        const map = pinMap(discovery);
        const pins = singlePins(map);
        if (await map.isVisible() && await pins.count() > 0) {
          await expectTilesRendered(map);
          expect(await pinnedTotal(map)).toBeGreaterThanOrEqual(await pins.count());

          // Mouse: click a pin whose centre is not covered by another pin or the list sheet.
          const pin = await firstClickablePin(map);
          const id = (await pin.getAttribute("data-pin-id")) || "";
          const name = await pinName(pin);
          await expect(pin).toHaveAttribute("aria-pressed", "false");
          await pin.click();
          await expect(pin).toHaveAttribute("aria-pressed", "true");
          const path = await expectPinCard(page, name);
          await expect(selectedListTitle(discovery)).toHaveText(name);
          await testInfo.attach("mouse-selection", { body: JSON.stringify({ id, name, path }), contentType: "application/json" });
          await page.screenshot({ path: testInfo.outputPath("selected-pin.png") });

          // Keyboard: Escape closes the card and returns focus to the pin; Enter on another pin opens its card.
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog", { name, exact: true })).toHaveCount(0);
          await expect(pinOrGroupOf(map, id)).toBeFocused();
          const other = await firstClickablePin(map, id);
          const keyboardName = await pinName(other);
          await other.focus();
          await expect(other).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(other).toHaveAttribute("aria-pressed", "true");
          await expectPinCard(page, keyboardName);
          await expect(page.getByRole("dialog", { name: keyboardName, exact: true })).toBeFocused();
          await expect(selectedListTitle(discovery)).toHaveText(keyboardName);
          await page.screenshot({ path: testInfo.outputPath("keyboard-selection.png") });
          await page.keyboard.press("Escape");
        } else {
          testInfo.annotations.push({ type: "coverage-gap", description: "Real Seoul results have no usable coordinates; pin selection was not tested." });
          await expect(discovery.getByRole("status")).toContainText("No map pins are available");
        }
      } else {
        testInfo.annotations.push({ type: "coverage-gap", description: "The real route returned no Seoul spots; map rendering and pin selection were not tested." });
      }

      await openListSheet(page);
      const quickFilters = page.getByRole("group", { name: "Quick filters" });
      await quickFilters.getByRole("button", { name: "Food", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("category") === "Food" && url.searchParams.get("view") === "map" && url.searchParams.get("city") === "seoul");
      await quickFilters.getByRole("button", { name: "Trending", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("sort") === "trending");

      for (const view of ["Grid", "List", "Map"] as const) {
        const toggle = page.getByRole("button", { name: `${view} view`, exact: true });
        // The phone map covers the page; its own close button returns to the grid.
        const closeMap = page.getByRole("button", { name: "Close map", exact: true });
        if (view === "Grid" && await closeMap.isVisible()) await closeMap.click();
        else await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        await expect(page).toHaveURL((url) =>
          url.searchParams.get("city") === "seoul" &&
          url.searchParams.get("category") === "Food" &&
          url.searchParams.get("sort") === "trending" &&
          url.searchParams.get("view") === (view === "Grid" ? null : view.toLowerCase()),
        );
        await expect(quickFilters.getByRole("button", { name: "Food", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect(quickFilters.getByRole("button", { name: "Trending", exact: true })).toHaveAttribute("aria-pressed", "true");
        if (view !== "Map") await expect(discovery).toHaveCount(0);
      }
      await expect(discovery.or(empty)).toBeVisible();
      await mapToggle.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("filtered-map.png") });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(errors.filter((message) => !message.includes("Failed to load resource"))).toEqual([]);
    } finally {
      await testInfo.attach("browser-errors", { body: JSON.stringify(errors, null, 2), contentType: "application/json" });
      if (!page.isClosed()) await page.screenshot({ path: testInfo.outputPath("final-page.png"), timeout: 5_000 }).catch(() => {});
    }
  });
}
