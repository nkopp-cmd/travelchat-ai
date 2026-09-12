// Opt-in local component fixture. No credentials, source fetches, email, or remote database access.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadPreviewExpectations, checkPreviewBrowser } from '../scripts/check-native-preview.mjs';

assert.equal(process.argv[2],'--fixture');
const root = new URL('../',import.meta.url);
const expected = await loadPreviewExpectations();
const origin = 'https://preview.localley.io';
const output = fileURLToPath(new URL(process.env.NATIVE_PREVIEW_OUTPUT ?? '.preview-private/native-acceptance-fixture/',root));
await mkdir(output,{recursive:true,mode:0o700});
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
try {
  const context = await browser.newContext({reducedMotion:'reduce'});
  let blockedExternal=0;
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin) {blockedExternal++;return route.abort();}
    assert.equal(route.request().method(),'GET','Fixture never submits auth or mutation requests');
    if(url.pathname==='/api/app-config') return route.fulfill({json:{mode:'preview',catalogSource:'seoul-pilot',registration:'restricted-preview',emailDelivery:'cloudflare'}});
    if(url.pathname==='/api/spots') return route.fulfill({json:{spots:expected.spots.map(spot=>({...spot,city:'Seoul',localley_score:null})).sort((a,b)=>a.id.localeCompare(b.id)),nextOffset:null}});
    if(url.pathname.startsWith('/api/')) return route.fulfill({status:403,json:{error:'Fixture signed out'}});
    assert.ok(url.pathname==='/'||/^\/(assets|pilot)\/[A-Za-z0-9._-]+$/.test(url.pathname));
    const extension=url.pathname.split('.').at(-1);
    const body=await readFile(new URL(`dist/public/${url.pathname==='/'?'index.html':url.pathname.slice(1)}`,root));
    return route.fulfill({body,contentType:url.pathname==='/'?'text/html':({js:'text/javascript',css:'text/css',jpg:'image/jpeg',png:'image/png',otf:'font/otf',txt:'text/plain'})[extension]??'application/octet-stream'});
  });
  const result=await checkPreviewBrowser(context,expected,{output,baseUrl:origin,requireTiles:false});
  console.log(JSON.stringify({fixture:true,...result,externalRequestsBlocked:blockedExternal,remoteRequests:0}));
} finally {await browser.close();}
