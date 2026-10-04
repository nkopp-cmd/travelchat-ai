import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { errorRouteGroup } from './route-groups.mjs';
import { classifyUserError } from './error-classes.mjs';

test('preserves static paths and favors static endpoints over dynamic IDs', () => {
  for (const path of ['/', '/dashboard', '/settings', '/sign-in', '/api/itineraries/generate', '/api/itineraries/save', '/api/notifications/preferences']) {
    assert.equal(errorRouteGroup('https://www.localley.io' + path + '?token=PRIVATEBYTES#secret'), path);
  }
  assert.equal(errorRouteGroup('https://www.localley.io/settings/'), '/settings');
  assert.equal(errorRouteGroup('https://www.localley.io/settings/PRIVATEBYTES'), ':unknown-route');
});
test('replaces user, share, opaque and nested resource values with fixed template labels', () => {
  const cases = [
    ['/users/person%40example.com', '/users/:username'], ['/shared/PRIVATEBYTES', '/shared/:shareCode'],
    ['/api/spots/PRIVATEBYTES/photos', '/api/spots/:id/photos'],
    ['/api/spots/PRIVATEBYTES/reviews/private-review/helpful', '/api/spots/:id/reviews/:reviewId/helpful'],
    ['/api/itineraries/PRIVATEBYTES/story/media/private-generation/private-slide', '/api/itineraries/:id/story/media/:generation/:slide'],
    ['/api/auth/PRIVATEBYTES/encoded%40email.test', '/api/auth/:route'],
    ['/sign-in/PRIVATEBYTES', '/sign-in/:route'],
  ];
  for (const [path, expected] of cases) assert.equal(errorRouteGroup('https://www.localley.io'+path), expected);
});
test('unknown, malformed, oversized and hostile paths never enter labels', () => {
  for (const value of [null, {}, '/PRIVATEBYTES', 'PRIVATEBYTES', 'file:///dashboard', 'javascript:PRIVATEBYTES',
    'https://www.localley.io/PRIVATEBYTES', 'https://www.localley.io/%50%52%49%56%41%54%45',
    'https://www.localley.io/api/spots/PRIVATE%2FVALUES/photos',
    'https://www.localley.io/api/spots/PRIVATE%5CVALUES/photos', 'https://www.localley.io/'+'a'.repeat(16384)]) {
    assert.equal(errorRouteGroup(value), ':unknown-route');
  }
});
test('known photo and preference classifications survive canonical grouping', () => {
  assert.equal(classifyUserError('GET private data', errorRouteGroup('https://www.localley.io/api/spots/PRIVATEBYTES/photos'), 502).errorClass, 'venue_photos_failed');
  assert.equal(classifyUserError('PATCH private data', errorRouteGroup('https://www.localley.io/api/notifications/preferences'), 503).errorClass, 'notification_preferences_unavailable');
});
test('catalog covers each checked source route and excludes its dynamic values', async () => {
  let count=0;
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes:true })) {
      const file=join(dir,entry.name);
      if(entry.isDirectory()) await walk(file);
      else if(['page.tsx','route.ts','route.tsx'].includes(entry.name)) {
        const parts=relative('app',dir).split(sep).filter(x=>x && !x.startsWith('('));
        const url='https://www.localley.io/'+parts.map(x=>x.startsWith('[')?'PRIVATEBYTES':x).join('/');
        const label=errorRouteGroup(url);
        assert.notEqual(label, ':unknown-route', file); assert.doesNotMatch(label,/PRIVATEBYTES/);count++;
      }
    }
  };await walk('app');assert.ok(count>100);
});
test('actual CLI groups multiple private IDs and retains event totals/status/coverage', async () => {
  const dir=await mkdtemp(join(tmpdir(),'localley-route-report-'));
  try {
    const preloader=`globalThis.fetch=async url=>{
      if(String(url).endsWith('/script-settings'))return new Response(JSON.stringify({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:true,persist:true}}}}));
      if(String(url).includes('/telemetry/query')){
        const paths=['/api/spots/PRIVATEALPHA/photos','/api/spots/PRIVATEBETA/photos','/users/person%40example.com','/PRIVATEBYTES'];
        const events=paths.map(path=>({$metadata:{service:'localley-next',url:'https://www.localley.io'+path+'?token=PRIVATEBYTES',message:'GET PRIVATEBYTES'},$workers:{event:{response:{status:502}}}}));
        return new Response(JSON.stringify({success:true,result:{run:{status:'COMPLETED'},statistics:{abr_level:1},events:{count:events.length,events}}}));
      }if(String(url).includes('/api/cities?'))return new Response(JSON.stringify({success:true,total:1,cities:[{slug:'seoul',spotCount:150,status:'recommended'}]}));return new Response('ok');};`;
    const reportPath=join(dir,'report.json');
    const run=spawnSync(process.execPath,['--import','data:text/javascript;base64,'+Buffer.from(preloader).toString('base64'),
      'scripts/check-production-health.mjs','--report',reportPath],{env:{...process.env,CLOUDFLARE_API_TOKEN:'fixture-token'},encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const report=JSON.parse(await readFile(reportPath,'utf8'));
    assert.equal(report.logs.observedEvents,4);assert.equal(report.logs.matchingEventsReported,4);
    assert.equal(report.logs.top5.reduce((n,x)=>n+x.count,0),4);
    assert.deepEqual(report.logs.top5[0],{path:'/api/spots/:id/photos',errorClass:'venue_photos_failed',message:'Venue photo request failed; source reason unavailable',status:502,count:2,eventTimes:{firstSeen:null,lastSeen:null,knownCount:0,unknownCount:2,scope:'returned_events_only'}});
    assert.equal(report.logs.errorClasses[0].count,2);
    assert.equal(report.logs.countingUnit,'log_events_not_requests_or_users');
    assert.ok(report.logs.coverageWarnings.includes('ingestion_sampling_not_audited'));
    assert.ok(report.ingestionSettings.coverageWarnings.includes('ingestion_delivery_not_proven'));
    assert.doesNotMatch(JSON.stringify(report)+run.stdout,/PRIVATEALPHA|PRIVATEBETA|PRIVATEBYTES|person|example\.com|fixture-token/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
