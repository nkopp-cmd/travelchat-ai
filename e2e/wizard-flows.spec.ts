import { test, expect } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page loads with the trip builder", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Localley/i);
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  });

  test("spots page loads anonymously", async ({ page }) => {
    await page.goto("/spots");
    await expect(page).toHaveURL(/\/spots/);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("templates page loads anonymously", async ({ page }) => {
    await page.goto("/templates");
    await expect(page).toHaveURL(/\/templates/);
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});

test.describe("itinerary wizard — single city", () => {
  test("gates Next until a city is picked", async ({ page }) => {
    await page.goto("/itineraries/new");
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

    const seoulCard = page.getByRole("button", { name: /Seoul/ }).first();
    await expect(seoulCard).toBeVisible({ timeout: 20_000 });
    await seoulCard.click();

    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  });

  test("carries city and days params into the wizard", async ({ page }) => {
    await page.goto("/itineraries/new?city=Seoul&days=4");
    await expect(page.getByRole("heading", { name: /your interests/i })).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("itinerary wizard — multi-city", () => {
  test("toggle is visible for anonymous users when the flag is on", async ({ page }) => {
    await page.goto("/itineraries/new");
    await expect(page.getByRole("button", { name: /multi-city/i })).toBeVisible({ timeout: 20_000 });
  });

  test("narrows picks to connected same-country cities", async ({ page }) => {
    await page.goto("/itineraries/new");
    await page.getByRole("button", { name: /multi-city/i }).click();

    const seoulCard = page.getByRole("button", { name: /Seoul/ }).first();
    await expect(seoulCard).toBeVisible({ timeout: 20_000 });
    await seoulCard.click();

    await expect(page.getByText(/1 city selected/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Bangkok/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Tokyo/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Busan/ })).toBeEnabled();
  });

  test("auto-bumps days and shows the optimized route preview", async ({ page }) => {
    await page.goto("/itineraries/new");
    await page.getByRole("button", { name: /multi-city/i }).click();

    await page.getByRole("button", { name: /Seoul/ }).first().click();
    await page.getByRole("button", { name: /Busan/ }).first().click();
    await expect(page.getByText("2 cities selected")).toBeVisible();

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Trip details")).toBeVisible();
    await expect(page.getByText("5 days")).toBeVisible();

    const preview = page.getByText("Your optimized route");
    await expect(preview).toBeVisible();
    await expect(page.locator("div", { has: preview }).getByText(/nights?/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/train/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("prunes disconnected picks when a connecting city is removed", async ({ page }) => {
    await page.goto("/itineraries/new");
    await page.getByRole("button", { name: /multi-city/i }).click();

    await page.getByRole("button", { name: /Seoul/ }).first().click();
    await page.getByRole("button", { name: /Busan/ }).first().click();
    await expect(page.getByText("2 cities selected")).toBeVisible();

    await page.getByRole("button", { name: /Seoul/ }).first().click();
    await expect(page.getByText(/1 city selected/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  });
});
