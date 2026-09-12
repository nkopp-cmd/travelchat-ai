import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

if (process.argv.length !== 3 || process.argv[2] !== '--live-preview') throw new Error('Explicit --live-preview required');
const credentials = JSON.parse(await readFile(new URL('../.preview-private/access.json', import.meta.url), 'utf8'));
const origin = 'https://preview.localley.io';
const headers = { 'CF-Access-Client-Id': credentials.clientId, 'CF-Access-Client-Secret': credentials.clientSecret };
const results = [];
for (const [path, expected] of [['/', 200], ['/api/health', 200], ['/api/app-config', 200], ['/api/spots', 200], ['/api/session', 401], ['/api/account/claim', 404], ['/api/auth/get-session', 403]]) {
  const anonymous = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  assert.ok([302, 403].includes(anonymous.status), `Anonymous ${path}: ${anonymous.status}`);
  const response = await fetch(origin + path, { headers, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, expected, `Service ${path}`);
  if (path === '/api/spots') assert.equal((await response.json()).spots.length, 4);
  if (path === '/api/health') assert.deepEqual(await response.json(), { ok: true });
  results.push({ path, anonymous: anonymous.status, service: response.status });
}
const denied = await fetch(origin + '/api/auth/sign-up/email', { method: 'POST', headers: { ...headers, Origin: origin, 'Content-Type': 'application/json' }, body: '{}', redirect: 'manual' });
assert.equal(denied.status, 403);
console.log(JSON.stringify({ httpChecks: results, servicePost: denied.status }));

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue({ headers: { ...route.request().headers(), ...headers } });
    if (url.origin === 'https://tile.openstreetmap.org') return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(origin);
    await page.getByRole('heading', { name: 'Get to know Seoul.' }).waitFor();
    await page.locator('.spot-card').first().waitFor();
    assert.equal(await page.locator('.spot-card').count(), 4);
    for (const image of await page.locator("img[src^='/pilot/']").all()) await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.images].filter(image => image.src.includes('/pilot/')).every(image => image.complete && image.naturalWidth > 0));
    await page.waitForFunction(() => [...document.querySelectorAll('img.leaflet-tile')].some(image => image.complete && image.naturalWidth > 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.preview-private/native-hosted-${width}.png`, fullPage: true });
  }
  const museum = page.locator('#place-052a314e-4aff-42c5-87f5-afa085efad0e');
  await museum.scrollIntoViewIfNeeded();
  assert.equal(await page.locator('img[src="/pilot/052a314e-4aff-42c5-87f5-afa085efad0e.jpg"]').count(), 1);
  assert.ok((await page.locator('.hero-photo').innerText()).includes('Gapo'));
  assert.ok((await museum.innerText()).includes('exhibition banners are historical')); 
  await museum.getByRole('button', { name: /Show on map/ }).click();
  await page.locator('.leaflet-popup').waitFor();
  assert.equal(await museum.getAttribute('data-selected'), 'true');
  await page.screenshot({path: '.preview-private/native-museum-map.png',fullPage:true});
  await page.getByRole('button', { name: 'Show on map: Seodaemun Independence Park', exact: true }).click();
  await page.locator('.leaflet-popup').waitFor();
  assert.equal(await page.locator('article[id="place-0041a575-c6fd-4a7e-b9c3-56cc50e201d6"]').getAttribute('data-selected'), 'true');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.getByText('Sign in with a verified, linked account to view trips.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Edit Itinerary', exact: true }).count(), 0);
  console.log(JSON.stringify(await page.locator('.skip-link').evaluate(element => ({ skipLinkViewportTop: element.getBoundingClientRect().top, position: getComputedStyle(element).position, focused: document.activeElement === element, scrollY: window.scrollY }))));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.preview-private/native-hosted-trips-blocked-390.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ screenshots: [1440, 900, 390], realTilesLoaded: true, mapSelection: 'passed', pageErrors: errors, humanAuth: 'not tested', emailSent: false }));
} finally { await browser.close(); }
