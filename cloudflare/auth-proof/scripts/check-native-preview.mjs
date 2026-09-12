// Read-only acceptance. Credentials and response bodies never enter the public receipt.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const origin = 'https://preview.localley.io';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const policy = 'https://archive.visitseoul.net/en/page/copyright?_ID=200100';
const creditFields = ['url','author','license','licenseUrl','sourceUrl'];
class AcceptanceFailure extends Error {}
const check = (condition, label) => { if (!condition) throw new AcceptanceFailure(label); };
const sorted = values => [...values].sort();

export function previewExpectations(base, native, manifest, notices) {
  const spots = [...base.spots, ...native.spots];
  check(spots.length > 0 && spots.length <= 24, 'manifest.place_bounds');
  check(new Set(spots.map(spot => spot.id)).size === spots.length, 'manifest.duplicate_identity');
  const sourceIds = new Map();
  for (const spot of spots) {
    check(/^[a-f0-9-]{36}$/.test(spot.id) && !!spot.name?.en, 'manifest.identity');
    if (['confirmed','reviewed_existing_uuid'].includes(spot.legacyMapping?.status)) {
      check(spot.id === spot.legacyMapping.legacyId, 'manifest.existing_uuid');
    }
    for (const url of spot.sourceUrls) {
      if (new URL(url).hostname !== 'english.visitseoul.net') continue;
      check(!sourceIds.has(url) || sourceIds.get(url) === spot.id, 'manifest.source_alias_collision');
      sourceIds.set(url, spot.id);
    }
    for (const credit of spot.photoCredits) {
      check(notices.includes(credit.sourceUrl) && notices.includes(credit.licenseUrl), 'manifest.public_notice');
      if (credit.sourceUrl.startsWith('https://archive.visitseoul.net/')) {
        check(spot.sourceUrls.includes(policy) && notices.includes(policy), 'manifest.archive_policy');
      }
    }
  }
  const photos = spots.flatMap(spot => spot.photos);
  check(new Set(photos).size === photos.length, 'manifest.duplicate_photo');
  check(new Set(manifest.files.map(asset => asset.file)).size === manifest.files.length, 'manifest.duplicate_asset');
  check(isDeepStrictEqual(sorted(photos), sorted(manifest.files.map(asset => `/pilot/${asset.file}`))), 'manifest.asset_set');
  for (const asset of manifest.files) {
    check(/^[a-f0-9-]{36}\.jpg$/.test(asset.file) && /^[a-f0-9]{64}$/.test(asset.sha256), 'manifest.asset_identity');
    const review = native.spots.find(spot => `${spot.id}.jpg` === asset.file);
    if (review) check(review.imageSha256 === asset.sha256, 'manifest.reviewed_image_hash');
  }
  return { spots, native: native.spots, assets: manifest.files, noticesSha256: sha(notices), sourceIds };
}

export async function loadPreviewExpectations() {
  const [base,native,manifest,notices] = await Promise.all(['pilot/catalog.json','pilot/native-reviewed.json','pilot/manifest.json','pilot/licenses.md']
    .map(path => readFile(new URL(path,root),'utf8')));
  return previewExpectations(JSON.parse(base),JSON.parse(native),JSON.parse(manifest),notices);
}

export function assertPreviewCatalog(payload, expected) {
  check(Array.isArray(payload?.spots) && payload.nextOffset === null, 'catalog.complete_page');
  check(isDeepStrictEqual(sorted(payload.spots.map(spot => spot.id)),sorted(expected.spots.map(spot => spot.id))), 'catalog.identity_set');
  for (const spot of expected.spots) {
    const actual = payload.spots.find(value => value.id === spot.id);
    for (const field of ['name','description','category','address','latitude','longitude','photos']) {
      check(isDeepStrictEqual(actual[field],spot[field]), `catalog.${field}:${spot.id}`);
    }
    check(actual.city === 'Seoul' && actual.localley_score === null, `catalog.city_or_score:${spot.id}`);
    check(Number.isFinite(actual.latitude) && Number.isFinite(actual.longitude)
      && actual.latitude >= 37.15 && actual.latitude <= 37.99 && actual.longitude >= 126.45 && actual.longitude <= 127.5, `catalog.coordinates:${spot.id}`);
    check(Array.isArray(actual.sourceUrls) && isDeepStrictEqual(sorted(actual.sourceUrls),sorted(spot.sourceUrls.map(url => new URL(url).href))), `catalog.sourceUrls:${spot.id}`);
    const credits = value => value.map(credit => Object.fromEntries(creditFields.map(field => [field,credit[field]])));
    check(Array.isArray(actual.photoCredits) && isDeepStrictEqual(credits(actual.photoCredits),credits(spot.photoCredits)), `catalog.photoCredits:${spot.id}`);
  }
  for (const [url,id] of expected.sourceIds) check(payload.spots.filter(spot => spot.sourceUrls.includes(url)).every(spot => spot.id === id), 'catalog.source_alias_uuid');
}

async function bodyBytes(response, maximum) {
  check(!!response.body, 'http.missing_body');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    check(size <= maximum, 'http.body_limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function checkPreviewAssets(expected, request) {
  const checked = [];
  for (const asset of expected.assets) {
    const response = await request(`/pilot/${asset.file}`);
    check(response.status === 200, `asset.status:${asset.file}`);
    check(response.headers.get('content-type')?.split(';')[0].trim() === 'image/jpeg', `asset.content_type:${asset.file}`);
    const bytes = await bodyBytes(response,16 * 1024 * 1024);
    check(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, `asset.jpeg_magic:${asset.file}`);
    check(sha(bytes) === asset.sha256, `asset.sha256:${asset.file}`);
    checked.push({ file: asset.file, sha256: asset.sha256, bytes: bytes.length });
  }
  const notices = await request('/pilot/licenses.txt');
  check(notices.status === 200 && sha(await bodyBytes(notices,256 * 1024)) === expected.noticesSha256, 'asset.public_notices');
  return { assets: checked, publicNotices: 'exact_match' };
}

export async function checkPreviewHttp(expected, request, full) {
  const results = [];
  for (const [path,status] of [['/',200],['/api/health',200],['/api/app-config',200],['/api/spots',200],['/api/session',401],['/api/account/claim',404],['/api/auth/get-session',403]]) {
    const anonymous = await request(path, false);
    check([302,403].includes(anonymous.status), `access.anonymous:${path}`);
    await anonymous.body?.cancel();
    const response = await request(path, true);
    check(response.status === status, `access.service:${path}`);
    if (path === '/api/health') check(isDeepStrictEqual(JSON.parse((await bodyBytes(response,1024)).toString()),{ok:true}), 'http.health');
    else if (path === '/api/spots' && full) assertPreviewCatalog(JSON.parse((await bodyBytes(response,2 * 1024 * 1024)).toString()),expected);
    else await response.body?.cancel();
    results.push({ path, anonymous: anonymous.status, service: response.status });
  }
  // Empty denial probe only: no address, password, recipient, session, or test email is supplied.
  const denied = await request('/api/auth/sign-up/email',true,'POST');
  check(denied.status === 403, 'access.service_post');
  await denied.body?.cancel();
  return { httpChecks: results, serviceOnlyReadonly: true, authDenied: true, emailSent: false };
}

export async function checkPreviewBrowser(context, expected, { output, baseUrl = origin, requireTiles = true } = {}) {
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  let pageErrors = 0;
  let imageFailures = 0;
  const imageResponses = [];
  page.on('pageerror',() => { pageErrors++; });
  page.on('response',response => {
    const url = new URL(response.url());
    const asset = expected.assets.find(asset => url.origin === baseUrl && url.pathname === `/pilot/${asset.file}`);
    if (!asset) return;
    imageResponses.push(response.body().then(bytes => {
      check(response.status() === 200 && response.headers()['content-type']?.split(';')[0].trim() === 'image/jpeg'
        && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && sha(bytes) === asset.sha256, 'ui.browser_image_bytes');
    }).catch(() => { imageFailures++; }));
  });
  const screenshots = [];
  const mapMeasurements = [];
  const capture = async (locator,name) => { await locator.screenshot({path:`${output}/${name}.png`});screenshots.push(`${name}.png`); };
  for (const width of [390,900,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(baseUrl);
    await page.getByRole('heading',{name:'Get to know Seoul.',exact:true}).waitFor();
    await page.waitForFunction(count => document.querySelectorAll('.spot-card').length === count,expected.spots.length);
    check(await page.locator('.spot-card').count() === expected.spots.length, `ui.card_count:${width}`);
    for (const spot of expected.spots) {
      const card = page.locator(`#place-${spot.id}`);
      await card.scrollIntoViewIfNeeded();
      check(await card.isVisible(), `ui.card_visible:${spot.id}`);
      check(await card.getByRole('heading',{name:spot.name.en,exact:true}).isVisible(), `ui.name:${spot.id}`);
      check(await card.locator('.spot-address').innerText() === spot.address, `ui.address:${spot.id}`);
      check((await card.innerText()).includes(spot.description.en), `ui.description:${spot.id}`);
      const links = await card.locator('.source-links a').evaluateAll(nodes => nodes.map(node => node.href));
      check(isDeepStrictEqual(sorted(links),sorted(spot.sourceUrls.map(url => new URL(url).href))), `ui.source_links:${spot.id}`);
      for (const credit of spot.photoCredits) {
        // The shared component can place this photo in the hero instead of its card.
        const image = page.locator(`img[src="${credit.url}"]`);
        check(await image.count() === 1, `ui.photo_identity:${spot.id}`);
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(image => image.decode());
        const imageState = await image.evaluate(image => ({loaded:image.complete && image.naturalWidth > 0,
          path:new URL(image.currentSrc).pathname,origin:new URL(image.currentSrc).origin,alt:image.alt,
          fit:getComputedStyle(image).objectFit,transform:getComputedStyle(image).transform,clip:getComputedStyle(image).clipPath}));
        check(imageState.loaded && imageState.path === credit.url && imageState.origin === baseUrl && imageState.alt === spot.name.en, `ui.photo_loaded:${spot.id}`);
        check(imageState.fit === 'contain' && imageState.transform === 'none' && imageState.clip === 'none', `ui.photo_uncropped:${spot.id}`);
        const figure = image.locator('..');
        check((await figure.innerText()).includes(credit.author), `ui.photo_author:${spot.id}`);
        check(await figure.getByRole('link',{name:credit.license,exact:true}).getAttribute('href') === credit.licenseUrl, `ui.photo_license:${spot.id}`);
        check(await figure.getByRole('link',{name:'Photo source',exact:true}).getAttribute('href') === new URL(credit.sourceUrl).href, `ui.photo_source:${spot.id}`);
        if (credit.takenAt && expected.native.some(review => review.id === spot.id)) {
          check((await card.innerText()).includes(credit.takenAt.slice(0,4)), `ui.historical_year:${spot.id}`);
          check(/historical|before later restoration/i.test(await card.innerText()), `ui.historical_caveat:${spot.id}`);
        }
      }
    }
    check(await page.locator('img[src^="/pilot/"]').count() === expected.assets.length, `ui.photo_count:${width}`);
    await Promise.all(imageResponses);
    check(imageFailures === 0, 'ui.browser_image_bytes');
    await page.locator('.catalog-map').scrollIntoViewIfNeeded();
    if (requireTiles) await page.waitForFunction(() => [...document.querySelectorAll('img.leaflet-tile')].some(image => image.complete && image.naturalWidth > 0));
    check((await page.locator('.map-heading').innerText()).includes(`${expected.spots.length} mapped places`), `ui.map_count:${width}`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `ui.overflow:${width}`);
    await page.evaluate(() => window.scrollTo(0,0));
    await page.screenshot({path:`${output}/native-hosted-${width}.png`,fullPage:true});
    screenshots.push(`native-hosted-${width}.png`);
    for (const spot of expected.native) {
      const card = page.locator(`#place-${spot.id}`);
      await card.getByRole('button',{name:`Show on map: ${spot.name.en}`,exact:true}).click();
      const popup = page.locator('.leaflet-popup-content');
      await popup.waitFor();
      check(await popup.locator('strong').innerText() === spot.name.en, `ui.map_popup:${spot.id}`);
      // Visibility precedes Leaflet's JS auto-pan. Require stable geometry, not merely elapsed time.
      const geometry = await page.evaluate(async () => {
        const measure = () => Object.fromEntries(['.leaflet-popup-content','.leaflet-control-zoom','.map-canvas','.leaflet-popup', '.leaflet-popup-content strong', '.leaflet-popup-content button'].map(selector => {
          const node = document.querySelector(selector);
          const {x,y,width,height} = node.getBoundingClientRect();
          return [selector,{x,y,width,height}];
        }));
        const initial = measure();
        let previous = initial, stableSince = performance.now();
        const start = stableSince;
        while (performance.now() - start < 2000) {
          await new Promise(requestAnimationFrame);
          const current = measure();
          if (JSON.stringify(current) !== JSON.stringify(previous)) stableSince = performance.now();
          if (performance.now() - stableSince >= 150) return {initial,settled:current,elapsedMs:performance.now()-start};
          previous = current;
        }
        throw new Error('Popup layout did not settle within 2000ms');
      });
      mapMeasurements.push({width,id:spot.id,name:spot.name.en,...geometry});
      await writeFile(`${output}/map-measurements.json`,JSON.stringify(mapMeasurements,null,2));
      await capture(page.locator('.catalog-map'),`native-map-${spot.id}-${width}`);
      const popupBox = geometry.settled['.leaflet-popup-content'];
      const zoomBox = geometry.settled['.leaflet-control-zoom'];
      check(!!popupBox && !!zoomBox && (popupBox.x + popupBox.width <= zoomBox.x || zoomBox.x + zoomBox.width <= popupBox.x
        || popupBox.y + popupBox.height <= zoomBox.y || zoomBox.y + zoomBox.height <= popupBox.y), `ui.map_controls_clear:${spot.id}`);
      const contains = (outer,inner) => inner.x >= outer.x && inner.y >= outer.y
        && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
      const frame = geometry.settled['.map-canvas'];
      check(contains(frame,geometry.settled['.leaflet-popup']) && contains(frame,zoomBox), `ui.map_unclipped:${spot.id}`);
      for (const selector of ['.leaflet-popup-content strong','.leaflet-popup-content button']) {
        check(contains(popupBox,geometry.settled[selector]), `ui.map_content_fit:${spot.id}`);
      }
      if (await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        check(isDeepStrictEqual(geometry.initial,geometry.settled), `ui.map_reduced_motion:${spot.id}`);
      }
      check(await card.getAttribute('data-selected') === 'true', `ui.map_selection:${spot.id}`);
      await popup.getByRole('button',{name:'View place in list',exact:true}).click();
      check(await card.evaluate(element => document.activeElement === element), `ui.map_to_list:${spot.id}`);
    }
    const zoomIn = page.locator('.leaflet-control-zoom-in');
    await zoomIn.focus();
    check(await zoomIn.evaluate(element => document.activeElement === element), `ui.map_zoom_focus:${width}`);
    await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Trips',exact:true}).click();
    await page.getByText('Sign in with a verified, linked account to view trips.',{exact:true}).waitFor();
    check(await page.getByRole('heading',{name:'Edit Itinerary',exact:true}).count() === 0, 'ui.trips_denied');
  }
  check(pageErrors === 0, 'ui.page_errors');
  await page.close();
  return { widths:[390,900,1440], cards:expected.spots.length, mappedNativeIds:expected.native.map(spot => spot.id),
    realTilesLoaded:requireTiles, imagesLoaded:true, imagesUncropped:true, historicalCaptions:true, screenshots, mapMeasurements,
    screenshotReview:'required_before_release', humanAuth:'not tested', emailSent:false };
}

async function main() {
  const [mode,...extra] = process.argv.slice(2);
  check(!extra.length && ['--live-preview','--assets-only'].includes(mode), 'usage.--live-preview_or_--assets-only');
  const expected = await loadPreviewExpectations();
  const credentials = JSON.parse(await readFile(new URL('.preview-private/access.json',root),'utf8'));
  check(typeof credentials.clientId === 'string' && typeof credentials.clientSecret === 'string', 'access.credentials_unavailable');
  const headers = {'CF-Access-Client-Id':credentials.clientId,'CF-Access-Client-Secret':credentials.clientSecret};
  const request = (path,service = true,method = 'GET') => fetch(origin + path,{method,redirect:'manual',signal:AbortSignal.timeout(20000),
    headers:{...(service ? headers : {}),...(method === 'POST' ? {Origin:origin,'Content-Type':'application/json'} : {})},
    ...(method === 'POST' ? {body:'{}'} : {})});
  const http = await checkPreviewHttp(expected,request,mode === '--live-preview');
  const assets = await checkPreviewAssets(expected,request);
  let ui;
  if (mode === '--live-preview') {
    const {chromium} = await import('playwright');
    const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
    try {
      const context = await browser.newContext({reducedMotion:'reduce'});
      await context.route('**/*',async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) {
          const response = await route.fetch({headers:{...route.request().headers(),...headers},maxRedirects:0,timeout:20000});
          return route.fulfill({response});
        }
        if (url.origin === 'https://tile.openstreetmap.org') return route.continue();
        return route.abort();
      });
      const output = fileURLToPath(new URL('.preview-private/native-acceptance/',root));
      await mkdir(output,{recursive:true,mode:0o700});
      ui = await checkPreviewBrowser(context,expected,{output});
    } finally { await browser.close(); }
  }
  console.log(JSON.stringify({mode,status:'passed',expectedPlaces:expected.spots.length,...http,...assets,
    ...(ui ? {ui} : {catalogAcceptance:'not run; assets-only does not approve data publication'})}));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({status:'failed',check:error instanceof AcceptanceFailure ? error.message : 'transport_or_browser_failure',
      remoteWrites:false,emailSent:false}));
    process.exitCode = 1;
  });
}
