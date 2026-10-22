import { expect, test } from "@playwright/test";

// docs/DESIGN.md: selection controls (filters, chips, toggles, clear) must never jump the page to the top.
// Run against prod with PLAYWRIGHT_BASE_URL=https://www.localley.io; skips when the catalog has no filters.
test("spots filters keep the scroll position", async ({ page }) => {
  await page.goto("/spots?city=seoul");
  await page.addStyleTag({ content: "html,body{scroll-behavior:auto!important}" });
  const clear = page.getByRole("button", { name: /clear filters/i }).first();
  test.skip(!(await clear.isVisible().catch(() => false)), "no filter UI (catalog unavailable)");
  await clear.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(300);
  await clear.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  test.skip(before < 200, "page too short to observe a jump");
  await clear.click();
  await page.waitForURL((url) => !url.searchParams.has("city"));
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.scrollY);
  expect(before - after, `Clear filters moved scroll ${before} -> ${after}`).toBeLessThan(150);
});
