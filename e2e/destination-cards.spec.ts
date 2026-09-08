import { expect, test, type Locator } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function expectCompactContentFits(card: Locator) {
  const geometry = await card.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const name = element.querySelector<HTMLElement>("span.font-bold.min-w-0")!;
    const footer = name.parentElement!.nextElementSibling!;
    const nameBounds = name.getBoundingClientRect();
    const footerBounds = footer.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(name);
    const boxes = [nameBounds, footerBounds, ...Array.from(range.getClientRects()),
      ...Array.from(footer.children).map((child) => child.getBoundingClientRect())];
    const [spots, tag] = Array.from(footer.children).map((child) => child.getBoundingClientRect());
    return {
      height: bounds.height,
      contained: boxes.every((box) => box.left >= bounds.left && box.right <= bounds.right + 1 &&
        box.top >= bounds.top && box.bottom <= bounds.bottom + 1),
      fullName: name.scrollWidth <= name.clientWidth + 1 && name.scrollHeight <= name.clientHeight + 1,
      footerGap: footerBounds.top - nameBounds.bottom,
      tagSeparated: !tag || spots.right <= tag.left || spots.bottom <= tag.top,
    };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(80);
  expect(geometry.contained).toBe(true);
  expect(geometry.fullName).toBe(true);
  expect(geometry.footerGap).toBeGreaterThanOrEqual(4);
  expect(geometry.tagSeparated).toBe(true);
}

async function expectSeparatedRows(card: Locator) {
  const geometry = await card.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const name = element.querySelector("span.truncate")!;
    const info = name.parentElement!.parentElement!;
    const row = info.previousElementSibling!;
    const infoBounds = info.getBoundingClientRect();
    const badges = Array.from(row.children).map((badge) => badge.getBoundingClientRect());
    return {
      height: bounds.height,
      gap: infoBounds.top - row.getBoundingClientRect().bottom,
      contained: [infoBounds, ...badges].every((box) =>
        box.left >= bounds.left && box.right <= bounds.right + 1 &&
        box.top >= bounds.top && box.bottom <= bounds.bottom + 1),
      badgesSeparated: badges.length < 2 || badges[0].right <= badges[1].left,
    };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(128);
  expect(geometry.gap).toBeGreaterThanOrEqual(8);
  expect(geometry.contained).toBe(true);
  expect(geometry.badgesSeparated).toBe(true);
}

for (const width of [390, 900, 1440]) {
  test(`destination badge geometry at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    // Keep real city data and static imagery; never invoke paid proxies or generation.
    await page.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const decoded = decodeURIComponent(url.href);
      if (/\/api\/.*(?:photo|generat|images|chat)|\/api\/(?:places|viator|tripadvisor)|places\.googleapis\.com|maps\.googleapis\.com|api\.(?:openai|anthropic|z\.ai)|fal\.ai|aiplatform\.googleapis\.com/i.test(decoded) ||
          (url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method()))) {
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/itineraries/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Where to?", exact: true })).toBeVisible({ timeout: 60_000 });
    const cards = page.locator("button[aria-pressed]").filter({ has: page.locator("span.font-bold.min-w-0") });
    await expect(cards.first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const card of await cards.all()) await expectSeparatedRows(card);
    await page.screenshot({ path: testInfo.outputPath("initial.png") });

    for (const status of ["Popular", "Beta"]) {
      const matches = cards.filter({ has: page.getByText(status, { exact: true }) });
      if (await matches.count() === 0) {
        testInfo.annotations.push({ type: "coverage-gap", description: `Real city data has no ${status} card.` });
        continue;
      }
      const card = matches.first();
      await expectSeparatedRows(card);
      await card.focus();
      await page.keyboard.press("Enter");
      await expect(card).toHaveAttribute("aria-pressed", "true");
      await expect(card.getByText("Ready", { exact: true })).toBeVisible();
      await expectSeparatedRows(card);
      await card.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.screenshot({ path: testInfo.outputPath(`selected-${status.toLowerCase()}.png`) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await page.goto("/itineraries/new?template=weekend-getaway&city=Seoul", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Where to?", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(cards.first()).toBeVisible();
    await expect(cards.getByText("Popular", { exact: true })).toHaveCount(0);
    await expect(cards.getByText("Beta", { exact: true })).toHaveCount(0);
    const compact = cards.filter({ has: page.getByText("Seoul", { exact: true }) });
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    for (const card of await cards.all()) await expectCompactContentFits(card);
    await page.screenshot({ path: testInfo.outputPath("compact-template.png") });
    const longestName = await cards.evaluateAll((elements) => elements.map((element) =>
      element.querySelector("span.font-bold.min-w-0")!.textContent!
    ).sort((a, b) => b.length - a.length)[0]);
    const longCard = cards.filter({ has: page.getByText(longestName, { exact: true }) });
    await longCard.focus();
    await page.keyboard.press("Enter");
    await expect(longCard).toHaveAttribute("aria-pressed", "true");
    for (const card of await cards.all()) await expectCompactContentFits(card);
    await longCard.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const cardBounds = await longCard.boundingBox();
    const generateBounds = await page.getByRole("button", { name: /Generate/ }).boundingBox();
    expect(cardBounds!.y + cardBounds!.height).toBeLessThanOrEqual(generateBounds!.y);
    await page.screenshot({ path: testInfo.outputPath("compact-long-name-selected.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
