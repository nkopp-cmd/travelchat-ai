import { expect, test } from "@playwright/test";

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
        await expect(discovery.getByRole("button", { name: /^Pin \d+:/ }).first(), "Strict real-map check requires a usable Seoul pin").toBeVisible();
      }
      await mapToggle.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("initial-map.png") });

      if (await discovery.isVisible()) {
        const choices = discovery.getByRole("list", { name: "Spots on this page" });
        const pins = choices.getByRole("button", { name: /^Pin \d+:/ });
        const pinCount = await pins.count();
        if (pinCount > 0) {
          const map = discovery.getByRole("region", { name: "Map of this page's spots" });
          const markers = map.locator(".leaflet-marker-icon");
          await expect(markers).toHaveCount(pinCount);
          await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
          // Center the whole map, rather than letting marker auto-scroll place it behind fixed navigation.
          await map.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
          await expect.poll(async () => {
            const box = await map.boundingBox();
            return Boolean(box && box.y >= 80 && box.y + box.height <= viewport.height - 100);
          }).toBe(true);

          // Inspect the visible number's hit target. Overlapping overview pins need not all be clickable.
          let visibleNumbers: number[] = [];
          await expect.poll(async () => {
            visibleNumbers = await markers.evaluateAll((elements) => elements.flatMap((element) => {
              const label = element.querySelector("span");
              if (!label) return [];
              const box = label.getBoundingClientRect();
              const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
              return hit && element.contains(hit) ? [Number(label.textContent)] : [];
            }));
            return visibleNumbers.some((number) => pinCount === 1 || number !== 1);
          }).toBe(true);
          const number = visibleNumbers.includes(2) ? 2 : visibleNumbers.find((value) => value !== 1) ?? 1;
          if (pinCount > 1 && !visibleNumbers.includes(2)) {
            testInfo.annotations.push({ type: "map-overlap", description: `Pin 2 is obscured at overview zoom. Mouse selection uses visible pin ${number}; keyboard selection covers pin 2. This does not establish identical coordinates.` });
          }
          const choice = pins.filter({ hasText: new RegExp(`^Pin ${number}:`) });
          const name = (await choice.locator("span").first().innerText()).replace(/^Pin \d+: /, "");
          await expect(choice).toHaveAttribute("aria-pressed", pinCount > 1 ? "false" : "true");
          const markerLabel = markers.locator("span").filter({ hasText: new RegExp(`^${number}$`) });
          await markerLabel.click();
          await expect(choice).toHaveAttribute("aria-pressed", "true");
          await expect(discovery.getByRole("heading", { name: `Selected spot: ${name}`, exact: true })).toBeVisible();
          await expect(discovery.getByTestId("spot-card-title")).toHaveText(name);
          await testInfo.attach("mouse-selection", { body: JSON.stringify({ number, name, visibleNumbers }), contentType: "application/json" });
          console.info(`${viewport.name}: mouse selected pin ${number} (${name}); pin 2 ${visibleNumbers.includes(2) ? "visible" : "obscured"} at overview zoom.`);
          await page.screenshot({ path: testInfo.outputPath("selected-pin.png") });

          // Establish focus on the first list button, then use real Tab and Enter keyboard input.
          const first = choices.getByRole("button").first();
          await first.focus();
          await expect(first).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(first).toHaveAttribute("aria-pressed", "true");
          const keyboardChoice = pins.nth(pinCount > 1 ? 1 : 0);
          for (let step = 0; step < await choices.getByRole("button").count(); step += 1) {
            if (await keyboardChoice.evaluate((element) => element === document.activeElement)) break;
            await page.keyboard.press("Tab");
          }
          await expect(keyboardChoice).toBeFocused();
          await keyboardChoice.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
          const keyboardName = (await keyboardChoice.locator("span").first().innerText()).replace(/^Pin \d+: /, "");
          await page.keyboard.press("Enter");
          await expect(keyboardChoice).toHaveAttribute("aria-pressed", "true");
          await expect(discovery.getByRole("heading", { name: `Selected spot: ${keyboardName}`, exact: true })).toBeVisible();
          await expect(discovery.getByTestId("spot-card-title")).toHaveText(keyboardName);
          await page.screenshot({ path: testInfo.outputPath("keyboard-selection.png") });
          await discovery.getByTestId("spot-card").scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath("selected-card.png") });
        } else {
          testInfo.annotations.push({ type: "coverage-gap", description: "Real Seoul results have no usable coordinates; pin selection was not tested." });
          await expect(discovery.getByRole("status")).toContainText("No map pins are available");
        }
      } else {
        testInfo.annotations.push({ type: "coverage-gap", description: "The real route returned no Seoul spots; map rendering and pin selection were not tested." });
      }

      const quickFilters = page.getByRole("group", { name: "Quick filters" });
      await quickFilters.getByRole("button", { name: "Food", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("category") === "Food" && url.searchParams.get("view") === "map" && url.searchParams.get("city") === "seoul");
      await quickFilters.getByRole("button", { name: "Trending", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("sort") === "trending");

      for (const view of ["Grid", "List", "Map"] as const) {
        const toggle = page.getByRole("button", { name: `${view} view`, exact: true });
        await toggle.click();
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
