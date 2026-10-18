/** Local assembled-route proof. Run under run-heavy, in a tmux window.
 * Usage: node scripts/verify-spot-card-routes.mjs <public-fixture.json> <new-output-dir>
 * Fixtures need three real, eligible public Seoul rows; weekly ranks are synthetic.
 * This does not prove hosted photos, authentication, trip inclusion or performance.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const [fixturePath, outputArg] = process.argv.slice(2);
assert(fixturePath && outputArg, 'fixture and new output directory required');
const output = resolve(outputArg);
await mkdir(output, { mode: 0o700 }); // Never overwrite a previous attempt.
const fixtureBytes = await readFile(fixturePath);
const { rows } = JSON.parse(fixtureBytes);
assert(rows?.length === 3 && new Set(rows.map(row => row.id)).size === 3, 'three distinct public rows');
const report = {
  at: new Date().toISOString(), state: 'pending',
  scope: 'Actual local Next.js pages; public record replay and synthetic weekly ranks. Unavailable photos. No hosted, photo, account, generated-trip, payment or performance acceptance.',
  fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
  cases: [], sourceRequests: [], forbiddenRequests: [], errors: [], consoleErrors: [],
};
for (const path of ['components/spots/spot-card.tsx', 'components/spots/weekly-trending-spots.tsx', 'app/spots/page.tsx', 'lib/spots/projection.ts']) {
  (report.sources ??= {})[path] = createHash('sha256').update(await readFile(path)).digest('hex');
}
const persist = () => writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
await persist();
const fixtureServer = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.local');
  report.sourceRequests.push({ method: req.method, path: url.pathname, query: url.search });
  res.setHeader('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes(req.method)) {
    report.forbiddenRequests.push({ method: req.method, path: url.pathname });
    res.writeHead(405); return res.end('{}');
  }
  let data;
  if (url.pathname === '/rest/v1/spots') {
    const range = Number(req.headers.range?.split('-')[0] || 0);
    data = range >= rows.length ? [] : rows.map(row => ({ ...row, destination: null, localArea: null }));
  } else if (url.pathname === '/rest/v1/weekly_city_spot_rankings') {
    data = rows.map((row, index) => ({ spot_id: row.id, city_slug: 'seoul', rank: index + 1, score: 3 - index, post_count: 1, platform_count: 1 }));
  } else if (['/rest/v1/social_spot_submissions', '/rest/v1/social_spot_submission_candidates'].includes(url.pathname)) {
    data = []; // Explicitly absent community provenance in this local fixture.
  } else {
    report.forbiddenRequests.push({ method: req.method, path: url.pathname });
    res.writeHead(404); return res.end('{}');
  }
  res.setHeader('Content-Range', `0-${data.length - 1}/${data.length}`);
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
});
let next, browser, page, log;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => { report.error = 'overall 12 minute deadline'; void browser?.close(); if (next) { try { process.kill(-next.pid, 'SIGTERM'); } catch {} } }, 720_000);
deadline.unref();
try {
  fixtureServer.listen(0, '127.0.0.1'); await once(fixtureServer, 'listening');
  const fixtureOrigin = `http://127.0.0.1:${fixtureServer.address().port}`;
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  // An allowlist prevents inherited production keys from entering the dev process.
  const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'TZ', 'TMPDIR', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { NODE_ENV: 'development', NODE_OPTIONS: '--max-old-space-size=1600', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: fixtureOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-public-fixture-only', SUPABASE_SERVICE_ROLE_KEY: 'local-rank-fixture-only', WEEKLY_SOCIAL_TRENDS_ENABLED: 'true', SUPABASE_READ_ONLY: 'true' });
  log = await open(resolve(output, 'next.log'), 'wx', 0o600);
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { env, detached: true, stdio: ['ignore', log.fd, log.fd] });
  const startup = Date.now() + 180_000;
  while (true) {
    assert(next.exitCode === null && next.signalCode === null, 'Next exited before readiness');
    try { await fetch(origin + '/favicon.ico', { signal: AbortSignal.timeout(1000) }); break; } catch { assert(Date.now() < startup, 'Next startup timeout'); await delay(500); }
  }
  browser = await chromium.launch({ headless: true });
  report.browser = browser.version();
  for (const width of [360, 390, 430]) for (const routePath of ['/spots', '/spots?city=seoul', '/spots?city=seoul&view=list']) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    page = await context.newPage(); page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(180_000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    await context.route('**/*', request => {
      const url = new URL(request.request().url());
      if (url.origin !== origin) { report.forbiddenRequests.push({ path: url.origin + url.pathname, method: request.request().method() }); return request.abort(); }
      if (url.pathname.startsWith('/api/auth/')) return request.fulfill({ contentType: 'application/json', body: 'null' });
      if (/^\/api\/spots\/[^/]+\/photos$/.test(url.pathname)) return request.fulfill({ contentType: 'application/json', body: '{"status":"unavailable","photos":[]}' });
      return request.continue();
    });
    await page.addInitScript(() => document.addEventListener('click', event => {
      const link = event.target.closest?.('a');
      if (!link || !/^\/spots\/[a-f0-9-]+$/i.test(link.getAttribute('href') || '')) return;
      window.__cardTap = { trusted: event.isTrusted, href: link.getAttribute('href') };
      event.preventDefault(); event.stopImmediatePropagation();
    }, true));
    const result = { width, route: routePath }; report.cases.push(result); await persist();
    const response = await page.goto(origin + routePath, { waitUntil: 'domcontentloaded' });
    result.http = response.status(); assert.equal(result.http, 200);
    const cards = page.getByTestId('spot-card'); await cards.nth(5).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="spot-card"] button')].some(button => !button.disabled));
    result.cardCount = await cards.count(); assert.equal(result.cardCount, 6, 'three weekly and three catalog shared cards');
    result.cardModes = await cards.evaluateAll(els => els.map(el => el.dataset.spotCard));
    result.documentWidth = await page.evaluate(() => document.documentElement.scrollWidth); assert(result.documentWidth <= width, 'no horizontal document overflow');
    result.frames = await page.locator('[data-testid="spot-card-photo"] figure>div').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
    assert.equal(result.frames.length, 6); assert(result.frames.every(r => Math.abs(r.width / r.height - 4 / 3) < 0.02), '4:3 actual card frames');
    result.text = await page.locator('[data-testid="spot-card-title"],[data-spot-card-meta],[data-testid="spot-card"] [data-slot="button"]').evaluateAll(els => els.map(el => { const css = getComputedStyle(el); return { text: el.textContent, overflow: el.scrollWidth > el.clientWidth + 1, ellipsis: css.textOverflow === 'ellipsis', clamp: css.webkitLineClamp }; }));
    assert(result.text.every(row => !row.overflow && !row.ellipsis && (!row.clamp || row.clamp === 'none')), 'full titles, geography and CTAs');
    result.controls = await cards.locator('button,a').evaluateAll(els => els.filter(el => !el.disabled && el.getBoundingClientRect().width).map(el => { const r = el.getBoundingClientRect(); return { label: el.getAttribute('aria-label') || el.textContent, width: r.width, height: r.height }; }));
    assert(result.controls.every(row => row.width >= 44 && row.height >= 44), '44px controls');
    // The section has a named accessible region through aria-labelledby.
    const weekly = page.locator('section[aria-roledescription="carousel"]');
    result.seeAll = await weekly.getByRole('link', { name: 'See all' }).getAttribute('href');
    const all = new URL(result.seeAll, origin); assert.equal(all.searchParams.get('city'), routePath.includes('city=') ? 'seoul' : null); assert.equal(all.hash, '#spot-results');
    const track = page.getByLabel('This week’s spots. Use left and right arrows to browse.', { exact: true });
    result.carousel = await track.evaluate(el => ({ snap: getComputedStyle(el).scrollSnapType, width: el.clientWidth, firstWidth: el.firstElementChild.getBoundingClientRect().width, nextLeft: el.children[1].getBoundingClientRect().left - el.getBoundingClientRect().left }));
    assert.equal(result.carousel.snap, 'x mandatory'); assert(result.carousel.firstWidth < result.carousel.width && result.carousel.nextLeft < result.carousel.width, 'next card peeks');
    await track.focus(); await page.keyboard.press('End'); await weekly.getByText('3/3', { exact: true }).waitFor();
    await page.keyboard.press('Home'); await weekly.getByText('1/3', { exact: true }).waitFor(); result.keyboard = 'passed';
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(output, `${width}-${report.cases.length}-overview.png`) });
    const last = cards.last().getByRole('link', { name: /^Details:/ });
    const cdp = await context.newCDPSession(page);
    // Native CDP touch at the right edge avoids controls and horizontal card tracks.
    for (let attempt = 0; attempt < 35; attempt++) {
      const r = await last.boundingBox(); const bottom = await clearBottom(page);
      if (r.y >= 0 && r.y + r.height <= bottom) break;
      const x = width - 8, y = bottom - 36, end = Math.max(130, y - 330);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (end - y) * i / 10 }] }); await page.waitForTimeout(20); }
      await page.waitForTimeout(120); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(300);
    }
    const box = await last.boundingBox(), bottom = await clearBottom(page);
    result.lastAction = { box, clearBottom: bottom }; assert(box.y >= 0 && box.y + box.height <= bottom, 'last Details above fixed navigation');
    assert(await last.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), 'last Details hit target');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.__cardTap); result.tap = await page.evaluate(() => window.__cardTap);
    assert(result.tap.trusted && result.tap.href === await last.getAttribute('href'), 'trusted intended Details tap');
    await page.screenshot({ path: resolve(output, `${width}-${report.cases.length}-last-action.png`) });
    await persist(); await context.close();
  }
  assert(report.sourceRequests.some(req => req.path.endsWith('/spots')), 'actual server catalog reads');
  assert(report.sourceRequests.some(req => req.path.endsWith('/weekly_city_spot_rankings')), 'actual weekly server reads');
  assert.equal(report.forbiddenRequests.length, 0, 'no external browser requests or unexpected fixture requests');
  assert.equal(report.errors.length, 0, 'no browser exceptions');
  report.state = 'passed';
} catch (error) {
  report.state = 'failed'; report.error = error.message; process.exitCode = 1;
  if (page && !page.isClosed()) {
    report.failureBody = await page.locator('body').innerText().catch(() => null);
    await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  }
} finally {
  clearTimeout(deadline); await browser?.close();
  if (next?.pid) {
    try { process.kill(-next.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await Promise.race([once(next, 'exit'), delay(3000)]);
    try { process.kill(-next.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  await log?.close(); fixtureServer.closeAllConnections(); await new Promise(resolve => fixtureServer.close(resolve));
  report.cleanup = 'Owned Next process group stopped; browser and fixture server closed'; await persist();
}
console.log(JSON.stringify({ state: report.state, cases: report.cases.length, error: report.error, output }));

async function clearBottom(page) {
  return page.evaluate(() => {
    let bottom = innerHeight;
    for (const el of document.querySelectorAll('body *')) {
      const css = getComputedStyle(el), r = el.getBoundingClientRect();
      if (css.position === 'fixed' && css.display !== 'none' && css.pointerEvents !== 'none' && r.width && r.height && r.height < innerHeight / 2 && r.top > innerHeight / 2 && r.bottom >= innerHeight - 1) bottom = Math.min(bottom, r.top);
    }
    return bottom;
  });
}
