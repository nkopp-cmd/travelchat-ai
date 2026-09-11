// Explicit component fixtures only. No database, credentials, email, or hosted access.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

if (process.argv[2] !== "--pilot") throw new Error("Use --pilot to opt into the public pilot component fixture");
const root = new URL("../", import.meta.url);
const pilot = JSON.parse(await readFile(new URL("pilot/catalog.json", root), "utf8"));
const output = process.env.PREVIEW_SCREENSHOTS;
if (!output) throw new Error("Set PREVIEW_SCREENSHOTS to an approved output directory");
// The caller selects the generated evidence path; no application data is written.
await mkdir(output, { recursive: true });
let configState = "preview";
let failPhoto = false;
let authRequests = 0;
const config = { mode: "preview", catalogSource: "seoul-pilot", registration: "restricted-preview", emailDelivery: "cloudflare" };
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const json = (body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
  if (path === "/api/app-config") return configState === "preview" ? json(config) : json({ error: "Fixture unavailable" }, configState === "404" ? 404 : 503);
  if (path === "/api/spots") return json({ spots: pilot.spots, nextOffset: null });
  if (path === "/api/auth/get-session") { authRequests++; return json(null); }
  if (path.startsWith("/api/")) return json({ error: "No auth mutations in this component check" }, 405);
  if (failPhoto && path.endsWith(".jpg")) { response.writeHead(404).end(); return; }
  if (path !== "/" && !/^\/(assets\/[A-Za-z0-9._-]+|pilot\/[A-Za-z0-9._-]+)$/.test(path)) { response.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(new URL(`dist/public/${path === "/" ? "index.html" : path.slice(1)}`, root));
    const extension = path.split(".").pop();
    response.writeHead(200, { "Content-Type": path === "/" ? "text/html" : ({ js: "text/javascript", css: "text/css", jpg: "image/jpeg", png: "image/png", txt: "text/plain", otf: "font/otf" })[extension] ?? "application/octet-stream" });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const external = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    external.push(url.href);
    // Test tile failure honestly, without contacting OSM or substituting a map.
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin);
    await page.getByRole("heading", { name: "Get to know Seoul." }).waitFor();
    await page.locator(".spot-card").first().waitFor();
    for (const image of await page.locator("img[src^='/pilot/']").all()) await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.images].filter((image) => image.src.includes("/pilot/")).every((image) => image.complete && image.naturalWidth > 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.locator(".auth-panel").isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".spot-card").count(), pilot.spots.length);
    await page.screenshot({ path: `${output}/preview-${width}.png`, fullPage: true });
  }
  const mapped = pilot.spots.find((spot) => Number.isFinite(spot.latitude) && Number.isFinite(spot.longitude));
  await page.getByRole("button", { name: `Show on map: ${mapped.name.en}`, exact: true }).click();
  await page.locator(".leaflet-popup").waitFor();
  assert.equal(await page.locator(`article[id="place-${mapped.id}"]`).getAttribute("data-selected"), "true");
  await page.getByRole("button", { name: "Preview account access", exact: true }).click();
  await page.getByRole("button", { name: "Create preview login", exact: true }).click();
  assert.ok((await page.locator(".auth-panel").innerText()).includes("unique password"));
  assert.ok(!(await page.locator("body").innerText()).includes("No email was delivered"));
  const photoUrls = await page.locator("img[src^='/pilot/']").evaluateAll((images) => images.map((image) => image.src));
  assert.equal(photoUrls.length, new Set(photoUrls).size);
  assert.ok(external.every((url) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url)));
  failPhoto = true;
  await page.reload();
  await page.getByText("Photo unavailable. No substitute image is shown.").first().waitFor();
  const realSpots = pilot.spots;
  pilot.spots = [{ ...mapped, latitude: 999, longitude: null, photos: ["https://example.invalid/stock.jpg"], sourceUrls: ["javascript:alert(1)", "https://example.org/place?q=Seoul%20park"], photoCredits: [null] }];
  await page.reload();
  await page.getByText("No valid coordinates are available. No pins are shown.").waitFor();
  assert.equal(await page.locator("img[src^='/pilot/']").count(), 0);
  assert.equal(await page.locator("a[href^='javascript:']").count(), 0);
  assert.equal(await page.locator(".source-links a").getAttribute("href"), "https://example.org/place?q=Seoul%20park");
  pilot.spots = realSpots;
  configState = "error";
  const before = authRequests;
  await page.reload();
  await page.getByRole("button", { name: "Retry configuration" }).waitFor();
  assert.equal(authRequests, before);
  assert.equal(await page.locator("form").count(), 0);
  configState = "404";
  await page.reload();
  await page.getByRole("heading", { name: "A few places to keep." }).waitFor();
  assert.equal(await page.locator(".catalog-map").count(), 0);
  assert.equal(await page.locator("img[src^='/pilot/']").count(), 0);
  assert.deepEqual(errors, []);
  console.log("Preview component checks passed at 1440, 900, and 390 pixels. Tiles were deliberately unavailable. Auth was not exercised.");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
