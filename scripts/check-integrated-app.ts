import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

async function main() {
  const origin = "http://100.124.34.110:3011";
  const output = "test-results/integrated-app";
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const results: { width: number; spotId: string; checks: string[]; signInWidget: string }[] = [];
  try {
    for (const width of [390, 900, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", serviceWorkers: "block" });
      await context.route("**/*", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const decoded = decodeURIComponent(url.href);
        const clerkClient = request.method() === "POST" && url.hostname === "clerk.localley.io" && url.pathname === "/v1/client";
        if ((!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !clerkClient)
          || decoded.includes("/api/places/photo") || /\/api\/spots\/[^/]+\/photos/.test(decoded)
          || /(^|\.)(googleapis\.com|fal\.ai|openai\.com|anthropic\.com)$/.test(url.hostname)) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const errors: string[] = [];
      let originRejected = false;
      page.on("response", async (response) => {
        const url = new URL(response.url());
        if (url.hostname !== "clerk.localley.io" || !["/v1/client", "/v1/environment"].includes(url.pathname) || response.status() !== 400) return;
        const body = await response.json().catch(() => null);
        if (body?.errors?.some((error: { code?: string }) => error.code === "origin_invalid")) originRejected = true;
      });
      page.on("pageerror", (error) => errors.push(error.message.replace(/https?:\/\/[^\s)]+/g, "[url]")));
      const shot = async (name: string) => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no overflow`);
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      };
      assert.equal((await page.goto(origin, { waitUntil: "domcontentloaded" }))?.status(), 200);
      await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
      await shot("landing");
      assert.equal((await page.goto(`${origin}/spots?city=seoul`, { waitUntil: "domcontentloaded" }))?.status(), 200);
      const links = page.locator('a[href^="/spots/"]');
      await expect(links.first()).toBeVisible();
      const href = await links.evaluateAll((elements) => elements.map((element) => element.getAttribute("href")).find((value) => /^\/spots\/[a-f0-9-]{36}(?:\?|$)/i.test(value || "")));
      const spotId = href?.match(/^\/spots\/([a-f0-9-]{36})(?:\?|$)/i)?.[1];
      assert.ok(spotId, "Catalog exposes a canonical spot URL");
      assert.equal((await page.goto(`${origin}/spots/${spotId}`, { waitUntil: "domcontentloaded" }))?.status(), 200);
      const add = page.getByRole("link", { name: "Add to itinerary", exact: true });
      await expect(add).toHaveAttribute("href", `/itineraries?spotId=${spotId}`);
      await shot("spot");
      await add.click();
      await page.waitForURL((url) => url.pathname.startsWith("/sign-in"));
      assert.equal(new URL(page.url()).searchParams.get("redirect_url"), `/itineraries?spotId=${spotId}`);
      await expect.poll(async () => originRejected || await page.getByRole("textbox", { name: /email/i }).first().isVisible()).toBe(true);
      const signInWidget = originRejected ? "blocked: Clerk origin_invalid on private HTTP origin" : "email input visible; sign-in not attempted";
      await shot("sign-in-continuation");
      assert.equal((await page.goto(`${origin}/itineraries/new?city=Seoul&spotId=${spotId}`, { waitUntil: "domcontentloaded" }))?.status(), 200);
      await expect(page.getByText("Choose its day and position after creating your trip.")).toBeVisible();
      const steps = page.getByRole("button", { name: /^Step [1-4]:/ });
      await expect(steps).toHaveCount(4);
      for (const step of await steps.all()) {
        const bounds = await step.boundingBox();
        assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= width, "Wizard step fits with a 44px target");
      }
      await shot("new-trip-selection");
      assert.deepEqual(errors, [], "No uncaught browser errors");
      results.push({ width, spotId, signInWidget, checks: ["landing", "real public catalog", "spot planning link", "sign-in return URL", "new-trip selected place", "wizard step bounds", "no overflow", "no uncaught errors"] });
      await context.close();
    }
    await writeFile(`${output}/report.json`, JSON.stringify({ results, paidPhotoRequests: "blocked", generationRequests: "blocked", authenticatedSave: "not tested" }, null, 2));
    console.log(JSON.stringify({ widths: results.map((result) => result.width), passed: results.length, signInWidget: results[0]?.signInWidget, authenticatedSave: "not tested" }));
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Browser check failed"); process.exitCode = 1; });
