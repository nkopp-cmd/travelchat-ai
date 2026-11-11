import { expect, test } from "@playwright/test";

// shared/plans/localley-mobile-map-ux-asia-growth.md item 2: "My location" on the phone map.
const PHONE = { width: 390, height: 844 };
const SEOUL_CITY_HALL = { latitude: 37.5665, longitude: 126.978 };

test.describe("map: my location", () => {
  test("granted: blue dot, map centred, sheet lists nearest spots first", async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true,
      permissions: ["geolocation"], geolocation: SEOUL_CITY_HALL });
    const page = await context.newPage();
    // Local dev has no D1: PLAYWRIGHT_STUB_NEAR answers the endpoint with two real-shaped cards. Live runs use real data.
    if (process.env.PLAYWRIGHT_STUB_NEAR) {
      const card = (n: number, name: string, lat: number, lng: number, distanceM: number) => ({
        id: `00000000-0000-4000-8000-00000000000${n}`, name, description: "Stub card for the local run.",
        location: { lat, lng, address: "Seoul" }, category: "Food", subcategories: [], localleyScore: 5, localPercentage: 70,
        bestTime: "", photos: [], tips: [], verified: true, trending: false, distanceM });
      await page.route((url) => url.pathname === "/api/spots/near", (route) => route.fulfill({
        json: { status: "ok", spots: [card(1, "City Hall Noodles", 37.5668, 126.9785, 40), card(2, "Insadong Tea", 37.574, 126.985, 1000)] },
        headers: { "cache-control": "private, max-age=60" } }));
    }
    await page.goto("/spots?view=map", { waitUntil: "domcontentloaded" });
    const button = page.getByTestId("map-locate");
    await expect(button).toBeVisible({ timeout: 30_000 });
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeGreaterThan(PHONE.width - 80); // bottom-right

    const near = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/spots/near");
    await button.click();
    const response = await near;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, max-age=60");
    const query = new URL(response.url()).searchParams;
    expect(query.get("lat")).toBe("37.567"); // rounded, never the exact position
    const body = await response.json() as { spots: Array<{ name: string; distanceM: number }> };
    expect(body.spots.length).toBeGreaterThan(0);
    const distances = body.spots.map((spot) => spot.distanceM);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));

    await expect(page.getByTestId("map-user-dot")).toBeVisible();
    await expect(page.getByTestId("map-sheet-title")).toHaveText(new RegExp(`^Near you · ${body.spots.length} spots?$`));
    const list = page.getByRole("list", { name: "Spots near you" });
    await expect(list).toBeVisible();
    await expect(list.locator(":scope > li").first()).toContainText(body.spots[0].name);
    await expect(list.locator(":scope > li").first()).toContainText(/away/);
    // The dot sits near the centre of the visible map area (above the sheet).
    await expect.poll(async () => {
      const dot = await page.getByTestId("map-user-dot").boundingBox();
      return dot ? Math.abs(dot.x + dot.width / 2 - PHONE.width / 2) : 999;
    }, { timeout: 10_000 }).toBeLessThan(40);
    expect(await page.evaluate(() => sessionStorage.getItem("ll-last-position"))).toContain("37.567");
    await page.screenshot({ path: testInfo.outputPath("locate-granted-390.png") });

    await page.getByRole("button", { name: "Show all spots" }).click();
    await expect(page.getByTestId("map-sheet-title")).not.toHaveText(/Near you/);
    await context.close();
  });

  test("denied: one message with the iPhone path and a city picker", async ({ browser }, testInfo) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true, permissions: [] });
    const page = await context.newPage();
    // Chromium answers PERMISSION_DENIED when the permission is not granted in a headless context.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
        getCurrentPosition: (_ok: unknown, fail: (error: { code: number; PERMISSION_DENIED: number }) => void) =>
          setTimeout(() => fail({ code: 1, PERMISSION_DENIED: 1 }), 50),
        watchPosition: () => 0, clearWatch: () => undefined,
      } });
    });
    await page.goto("/spots?view=map", { waitUntil: "domcontentloaded" });
    await page.getByTestId("map-locate").click({ timeout: 30_000 });
    const message = page.getByTestId("map-locate-message");
    await expect(message).toHaveAttribute("data-status", "denied");
    await expect(message).toContainText("Location Services > Safari Websites > While Using");
    // Really on top: nothing (sheet, filters) covers the message.
    expect(await message.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 12);
      return rect.top >= 0 && rect.bottom <= window.innerHeight && !!hit && element.contains(hit);
    })).toBe(true);
    await expect(message.getByRole("link", { name: "Seoul" })).toHaveAttribute("href", /\/spots\?city=seoul&view=map/);
    await page.screenshot({ path: testInfo.outputPath("locate-denied-390.png") });
    await message.getByRole("button", { name: "OK" }).click();
    await expect(message).toHaveCount(0);
    await context.close();
  });
});
