import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkCityCatalog, summarizeCityCatalog } from './city-catalog.mjs';
const city = (slug, spotCount, status) => ({ slug, spotCount, status, name: 'secret user', address: 'private-address' });
const body = cities => ({ success: true, total: cities.length, cities });
const healthy = body([city('seoul',150,'recommended'),city('tokyo',60,'available'),city('busan',1,'beta'),city('hidden',0,'hidden')]);

test('retains only numeric catalog health and declares partial-source/parity limits', () => {
  assert.deepEqual(summarizeCityCatalog(healthy), { usable:true, cityCount:4,visibleCities:3,totalSpots:211,
    scope:'response_content_only',limitation:'partial_source_failures_and_row_parity_not_proven' });
  assert.doesNotMatch(JSON.stringify(summarizeCityCatalog(healthy)), /secret|address|seoul|tokyo/);
});
test('HTTP200 empty arrays and all-hidden catalogs cannot be healthy', async () => {
  for (const raw of [body([]),body([city('seoul',0,'hidden')])]) {
    assert.deepEqual(await checkCityCatalog(new Response(JSON.stringify(raw))),{usable:false,reason:'empty_catalog'});
  }
});
test('refuses malformed shape, duplicate cities, invalid counts, wrong statuses and unsafe sums', () => {
  for (const raw of [null,{},[],{...healthy,success:false},{...healthy,total:5},{...healthy,cities:{}},
    body([null]),body([city('x',1,'beta'),city('x',1,'beta')]),body([city('private@example.com',1,'beta')]),
    body([city('x',-1,'hidden')]),body([city('x','1','beta')]),body([city('x',1.5,'beta')]),
    body([city('x',Infinity,'recommended')]),body([city('x',1,'hidden')]),body([city('x',60,'recommended')]),
    body([city('x',Number.MAX_SAFE_INTEGER,'recommended'),city('y',1,'beta')]),
    body(Array.from({length:1001},(_,i)=>city('x'+i,1,'beta')))]) {
    assert.deepEqual(summarizeCityCatalog(raw),{usable:false,reason:'invalid_catalog'});
  }
});
test('bounds streamed bytes and cancels without echoing upstream content', async () => {
  let canceled=false, pulls=0;
  const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(262145));},cancel(){canceled=true;}});
  const result=await checkCityCatalog(new Response(stream));
  assert.deepEqual(result,{usable:false,reason:'catalog_too_large'});assert.equal(canceled,true);assert.ok(pulls<=2);
  for(const response of [new Response('private-token'),new Response('private-token',{status:503}),
    new Response(null),new Response(new ReadableStream({start(c){c.error(Error('private-token'));}}))]) {
    const result=await checkCityCatalog(response);assert.equal(result.usable,false);assert.doesNotMatch(JSON.stringify(result),/private-token/);
  }
});
test('actual daily CLI fails HTTP200 empty content, passes healthy content and preserves log coverage', async () => {
  const directory=await mkdtemp(join(tmpdir(),'localley-city-health-'));
  try {
    for(const [payload, expected] of [[body([]),1],[healthy,0]]) {
      const preloader=`globalThis.fetch=async (url,options)=>{
        if(String(url).endsWith('/script-settings'))return new Response(JSON.stringify({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:true,persist:true}}}}));
        if(String(url).includes('/telemetry/query'))return new Response(JSON.stringify({success:true,result:{run:{status:'COMPLETED'},statistics:{abr_level:10},events:{count:0,events:[]}}}));
        if(options.redirect!=='error')throw Error('redirect-policy');
        if(String(url).includes('/api/cities?'))return new Response(JSON.stringify(${JSON.stringify(payload)}));return new Response('ok');};`;
      const path=join(directory,expected+'.json');
      const result=spawnSync(process.execPath,['--import','data:text/javascript;base64,'+Buffer.from(preloader).toString('base64'),
        'scripts/check-production-health.mjs','--report',path],{env:{...process.env,CLOUDFLARE_API_TOKEN:'fixture-token'},encoding:'utf8'});
      assert.equal(result.status,expected,result.stderr);
      const report=JSON.parse(await readFile(path,'utf8'));
      assert.deepEqual(report.health.map(x=>x.status),[200,200,200]);assert.equal(report.health[2].catalog.usable,expected===0);
      assert.equal(report.logs.available,true);assert.equal(report.logs.observedEvents,0);
      assert.ok(report.logs.coverageWarnings.includes('query_sampled'));assert.equal(report.logs.rankingScope,'returned_events_only');
      assert.doesNotMatch(JSON.stringify(report)+result.stdout,/private-address|secret user|fixture-token/);
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});
