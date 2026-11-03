import { expect, type Page } from "@playwright/test";

/** A spot detail shows one visible photo hero, or none when no photo exists; never an empty image box. */
export async function expectHeroOrNone(page: Page): Promise<void> {
  const hero = page.getByTestId("spot-detail-hero").filter({ visible: true });
  expect(await hero.count()).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-testid="spot-detail-hero"] [data-testid="photo-placeholder"]')).toHaveCount(0);
}
