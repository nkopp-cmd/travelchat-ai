import fs from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

const ENFORCE_REAL_IMAGES = process.env.PLAYWRIGHT_ENFORCE_REAL_IMAGES === "1";
const LOCAL_ENV_FILES = [".env.local", ".env.development.local", ".env"].filter(
  (file) => fs.existsSync(file),
);
const HAS_LOCAL_SUPABASE_ENV =
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ) ||
  LOCAL_ENV_FILES.some((file) => {
    const contents = fs.readFileSync(file, "utf8");
    return (
      contents.includes("NEXT_PUBLIC_SUPABASE_URL") &&
      contents.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    );
  });

function isLocalBaseUrl(baseURL?: string) {
  return Boolean(
    baseURL && (baseURL.includes("127.0.0.1") || baseURL.includes("localhost")),
  );
}

function skipIfLocalSupabaseEnvMissing(baseURL?: string) {
  test.skip(
    isLocalBaseUrl(baseURL) && !HAS_LOCAL_SUPABASE_ENV,
    "Local spots layout needs Supabase env; preview/live runs cover production data.",
  );
}

async function skipIfVercelProtectionPage(page: Page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  test.skip(
    bodyText.includes("Log in to Vercel"),
    "Preview deployment is behind Vercel protection; run against local env or live production.",
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectInside(parent: Locator, child: Locator) {
  const [parentBox, childBox] = await Promise.all([
    parent.boundingBox(),
    child.boundingBox(),
  ]);

  expect(parentBox).toBeTruthy();
  expect(childBox).toBeTruthy();

  if (!parentBox || !childBox) return;

  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x - 1);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y - 1);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(
    parentBox.x + parentBox.width + 1,
  );
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(
    parentBox.y + parentBox.height + 1,
  );
}

function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

test.describe("spots responsive layout", () => {
  for (const viewport of VIEWPORTS) {
    test(`spots cards and filters fit at ${viewport.name}`, async ({
      page,
      baseURL,
    }) => {
      skipIfLocalSupabaseEnvMissing(baseURL);
      await page.setViewportSize(viewport);
      await page.goto("/spots?city=seoul&score=5&sort=trending", {
        waitUntil: "networkidle",
      });
      await skipIfVercelProtectionPage(page);

      await expect(
        page
          .getByRole("heading", {
            name: /discover (hidden gems|local spots)/i,
          })
          .first(),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      if (viewport.width < 768) {
        const mobileFilterRow = page.getByTestId("spots-mobile-filter-row");
        const filterToggle = page.getByTestId("spots-mobile-filter-toggle");
        const scoreTrigger = page.getByTestId("spots-score-filter-trigger");
        await expect(mobileFilterRow).toBeVisible();
        await expect(filterToggle).toBeVisible();
        await expect(scoreTrigger).toBeVisible();
        await expectInside(mobileFilterRow, filterToggle);

        const filterButton = await filterToggle.boundingBox();
        const scoreButton = await scoreTrigger.boundingBox();

        expect(filterButton).toBeTruthy();
        expect(scoreButton).toBeTruthy();
        if (filterButton && scoreButton) {
          expect(boxesOverlap(filterButton, scoreButton)).toBe(false);
        }
      }

      const cards = page.getByTestId("spot-card");
      await expect(cards.first()).toBeVisible();
      const visibleCards = Math.min(await cards.count(), 6);

      for (let index = 0; index < visibleCards; index += 1) {
        const card = cards.nth(index);
        await expect(card.getByTestId("spot-card-title")).toBeVisible();
        await expect(card.getByTestId("spot-card-photo")).toBeVisible();

        const chips = card.locator("[data-layout-chip]").filter({
          visible: true,
        });
        const chipCount = await chips.count();
        const boxes: Array<{
          x: number;
          y: number;
          width: number;
          height: number;
        }> = [];

        for (let chipIndex = 0; chipIndex < chipCount; chipIndex += 1) {
          const chip = chips.nth(chipIndex);
          await expectInside(card, chip);
          const box = await chip.boundingBox();
          if (box) boxes.push(box);
        }

        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            expect(boxesOverlap(boxes[i], boxes[j])).toBe(false);
          }
        }
      }

      if (ENFORCE_REAL_IMAGES) {
        await expect(page.getByTestId("spot-photo-backfill-chip")).toHaveCount(
          0,
        );
      }
    });
  }

  test("spot detail exposes exact navigation and address data", async ({
    page,
    baseURL,
  }) => {
    test.skip(
      !baseURL || (isLocalBaseUrl(baseURL) && !HAS_LOCAL_SUPABASE_ENV),
      "Spot detail pages need production-like Supabase admin env.",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/spots?city=seoul&score=5&sort=trending", {
      waitUntil: "networkidle",
    });
    await skipIfVercelProtectionPage(page);

    const firstSpot = page.getByTestId("spot-card").first();
    await expect(firstSpot).toBeVisible();
    await firstSpot.getByTestId("spot-card-photo").click();

    await expect(page.getByTestId("spot-detail-hero")).toBeVisible();
    await expect(
      page.getByTestId("spot-detail-address").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("spot-detail-navigation-target").first(),
    ).toBeVisible();
    await expect(page.getByTestId("spot-directions-link").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
