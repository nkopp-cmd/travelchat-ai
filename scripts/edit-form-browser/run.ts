import assert from "node:assert/strict";
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { chromium, expect } from "@playwright/test";
import tailwindConfig from "../../tailwind.config";
import type { ItinerarySnapshot, PlanningActivity } from "../../lib/itineraries/spot-planning";
import type { ItineraryInsight } from "../../lib/itineraries/normalize-daily-plans";

type SubmittedDraft = Omit<ItinerarySnapshot, "activities"> & {
  days: { day: number; activities: PlanningActivity[] }[];
  insights: ItineraryInsight[];
  expected: ItinerarySnapshot;
};

async function main() {
  const root = process.cwd();
  const output = path.join(root, "test-results/edit-form-browser");
  await mkdir(output, { recursive: true });
  const alias = { "@": root, "next/navigation": path.join(root, "scripts/edit-form-browser/navigation.ts") };
  const define = { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": '""' };
  const common = { bundle: true, alias, define, jsx: "automatic" as const, logLevel: "warning" as const };
  await build({ ...common, entryPoints: ["scripts/edit-form-browser/fixture.tsx"], platform: "node", packages: "external", outfile: path.join(output, "server.cjs"), format: "cjs" });
  await build({ ...common, entryPoints: ["scripts/edit-form-browser/client.tsx"], platform: "browser", outfile: path.join(output, "client.js") });
  const require = createRequire(import.meta.url);
  const { Harness, itinerary, spot } = require(path.join(output, "server.cjs"));
  const css = await postcss([tailwind(tailwindConfig)]).process(await readFile("app/globals.css", "utf8"), { from: path.join(root, "app/globals.css") });
  await writeFile(path.join(output, "styles.css"), css.css);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"><title>EditForm isolated verification</title></head><body><div id="root">${renderToString(React.createElement(Harness))}</div><script src="/client.js"></script></body></html>`;
  const server = createServer(async (request, response) => {
    if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); }
    else if (["/client.js", "/styles.css"].includes(request.url || "")) {
      response.setHeader("Content-Type", request.url === "/client.js" ? "text/javascript" : "text/css");
      response.end(await readFile(path.join(output, request.url!.slice(1))));
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const report = {
    browser: browser.version(),
    checks: [] as { scenario: string; passed: boolean; checks: string[] }[],
    consoleErrors: [] as { scenario: string; text: string }[],
    pageErrors: [] as { scenario: string; text: string }[],
    blockedRequests: [] as { scenario: string; url: string }[],
    screenshots: [] as string[],
    requests: [] as { scenario: string; method: string; body: SubmittedDraft }[],
  };
  try {
    for (const width of [390, 900, 1440]) {
      for (const conflict of [false, true]) {
        const scenario = `${width}-${conflict ? "conflict" : "success"}`;
        const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
        const page = await context.newPage();
        const requests: SubmittedDraft[] = [];
        const errors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") { errors.push(message.text()); report.consoleErrors.push({ scenario, text: message.text() }); }
        });
        page.on("pageerror", (error: Error) => report.pageErrors.push({ scenario, text: error.message }));
        await context.route("**/*", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin === origin && url.pathname === "/api/itineraries/browser-fixture/update" && request.method() === "PATCH") {
            const submitted = request.postDataJSON() as SubmittedDraft;
            requests.push(submitted);
            report.requests.push({ scenario, method: request.method(), body: submitted });
            const snapshot = { title: submitted.title, city: submitted.city, activities: submitted.insights.length ? { dailyPlans: submitted.days, insights: submitted.insights } : submitted.days, highlights: submitted.highlights, estimated_cost: submitted.estimated_cost };
            await route.fulfill({ status: conflict ? 409 : 200, contentType: "application/json", body: JSON.stringify(conflict ? { error: "Fixture conflict" } : { itinerary: snapshot }) });
          } else if (url.origin === origin && ["/", "/styles.css", "/client.js"].includes(url.pathname) && request.method() === "GET") {
            await route.continue();
          } else { report.blockedRequests.push({ scenario, url: request.url() }); await route.abort(); }
        });
        await page.clock.install();
        await page.goto(origin);
        await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
        const save = page.getByRole("button", { name: "Save", exact: true });
        const add = page.getByRole("button", { name: "Add to draft", exact: true });
        await expect(save).toBeDisabled();
        await expect(add).toBeDisabled();
        await expect(page.getByLabel("Position", { exact: true })).toBeDisabled();
        await page.clock.fastForward(31_000);
        assert.equal(requests.length, 0, "Opening must not save");
        await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(0);
        await expect(page.getByText(spot.name, { exact: true })).toHaveCount(0);
        const screenshot = async (state: string) => {
          await page.evaluate(() => window.scrollTo(0, 0));
          const file = path.join(output, `${scenario}-${state}.png`);
          await page.screenshot({ path: file, fullPage: true });
          report.screenshots.push(file);
           assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "No horizontal overflow");
           assert.equal(await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button[aria-label^="Edit "], button[aria-label^="Copy "], button[aria-label^="Delete "]')].every((button) => {
             const control = button.getBoundingClientRect();
             const row = button.closest('[data-rfd-draggable-id]')?.getBoundingClientRect();
             return row && control.left >= row.left && control.right <= row.right && control.width >= 44 && control.height >= 44;
           })), true, "Activity controls fit their rows with 44px targets");
        };
        if (!conflict) await screenshot("opening");
        await page.getByLabel("Day", { exact: true }).selectOption("2");
        await expect(add).toBeDisabled();
        await page.getByLabel("Position", { exact: true }).selectOption("1");
        await expect(save).toBeDisabled();
        assert.equal(requests.length, 0, "Selection must not save");
        await add.click();
        await expect(page.getByText("This spot is already in your plan.", { exact: true })).toBeVisible();
        await expect(add).toHaveCount(0);
        await expect(page.getByText(spot.name, { exact: true })).toHaveCount(1);
        assert.equal(requests.length, 0, "Add must only change the draft");
        if (!conflict) await screenshot("draft");
        await save.click();
        await expect.poll(() => requests.length).toBe(1);
        const submitted = requests[0];
        assert.deepEqual(submitted.expected, { title: itinerary.title, city: itinerary.city, activities: itinerary.activities, highlights: itinerary.highlights, estimated_cost: itinerary.estimated_cost });
        assert.deepEqual(submitted.days[0], itinerary.activities[0]);
        assert.deepEqual(submitted.days[1].activities.map((activity) => activity.name), ["Anguk lunch", spot.name, "Bukchon walk"]);
        assert.equal(submitted.days.flatMap((day) => day.activities).filter((activity) => activity.spotId === spot.id).length, 1);
        assert.equal(submitted.days[1].activities[1].spotId, spot.id);
        assert.equal(submitted.days[1].activities[1].lat, spot.latitude);
        assert.equal(submitted.days[1].activities[1].lng, spot.longitude);
        if (conflict) {
          await expect(page.getByRole("alert")).toContainText("Your draft remains here. Automatic saving has stopped.");
          await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
          await expect(page.getByText(spot.name, { exact: true })).toHaveCount(1);
          await expect(save).toBeDisabled();
          await page.clock.fastForward(61_000);
          assert.equal(requests.length, 1, "Conflict must stop autosave retries");
          assert.equal(errors.filter((text) => text.startsWith("Save error:")).length, 1);
        } else {
          await expect(page.getByText("Saved", { exact: true })).toBeVisible();
          await expect(save).toBeDisabled();
          await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(0);
        }
        await screenshot("result");
        assert.equal(errors.filter((text) => !conflict || (!text.startsWith("Save error:") && !text.includes("409 (Conflict)"))).length, 0, "No unexpected console errors");
        report.checks.push({ scenario, passed: true, checks: ["SSR hydration", "opening unchanged after 31s", "day and position required", "selection unchanged", "draft-only insertion", "staging duplicate prevention", "day 2 position 1", "canonical spotId and coordinates", "original expected snapshot", conflict ? "409 retains draft and stops autosave for 61s" : "submitted snapshot accepted", "no horizontal overflow"] });
        await context.close();
      }
    }
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.blockedRequests, []);
    console.log(JSON.stringify({ scenariosPassed: report.checks.length, browser: report.browser, screenshots: report.screenshots.length, consoleErrors: report.consoleErrors, pageErrors: report.pageErrors, blockedRequests: report.blockedRequests }, null, 2));
  } finally {
    await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
