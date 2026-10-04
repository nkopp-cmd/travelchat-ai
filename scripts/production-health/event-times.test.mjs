import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { recordEventTime, summarizeEventTime } from './event-times.mjs';
const from=Date.parse('2026-10-04T00:00:00Z'),to=from+86400000,window={from,to};
const times=values=>summarizeEventTime(values.reduce((group,t)=>recordEventTime(group,t,window),null));

test('unsorted timestamps preserve count and exact observed bounds, including query boundaries',()=>{
  const result=times([to,from+1000,from,from+500]);
  assert.equal(result.count,4);assert.deepEqual(result.eventTimes,{firstSeen:'2026-10-04T00:00:00.000Z',lastSeen:'2026-10-05T00:00:00.000Z',knownCount:4,unknownCount:0,scope:'returned_events_only'});
});
test('missing, hostile, wrong-unit, fractional and out-of-window times remain unknown',()=>{
  const inputs=[undefined,null,{},[],true,'private-token',new Date(from).toISOString(),String(from),NaN,Infinity,-1,from-1,to+1,from+0.5,from/1000,from*1000000];
  const result=times(inputs);assert.equal(result.count,inputs.length);assert.equal(result.eventTimes.knownCount,0);assert.equal(result.eventTimes.unknownCount,inputs.length);assert.equal(result.eventTimes.firstSeen,null);assert.equal(result.eventTimes.lastSeen,null);assert.doesNotMatch(JSON.stringify(result),/private-token/);
});
test('mixed evidence cannot assign valid dates to unknown events',()=>{
  const result=times([from+5000,undefined,to+1,from+1000]);assert.equal(result.count,4);assert.equal(result.eventTimes.knownCount,2);assert.equal(result.eventTimes.unknownCount,2);assert.equal(result.eventTimes.firstSeen,new Date(from+1000).toISOString());assert.equal(result.eventTimes.lastSeen,new Date(from+5000).toISOString());
});
test('invalid query windows fail closed without producing hostile dates',()=>{
  for(const w of [undefined,{}, {from:'private-token',to}, {from:to,to:from}, {from:-1,to}, {from,to:253402300800000}]){
    const result=summarizeEventTime(recordEventTime(null,from,w));assert.equal(result.eventTimes.knownCount,0);assert.equal(result.eventTimes.unknownCount,1);assert.equal(result.eventTimes.firstSeen,null);
  }
});
test('actual CLI retains grouped event times, missing-time evidence, counts and privacy',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'localley-event-times-'));
  try{
    const preload=`globalThis.fetch=async (url,options)=>{
      if(String(url).endsWith('/script-settings'))return new Response(JSON.stringify({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:true,persist:true}}}}));
      if(String(url).includes('/telemetry/query')){
        const q=JSON.parse(options.body),end=q.timeframe.to;
        const photo='[spot-photos] '+JSON.stringify({spotId:'550e8400-e29b-41d4-a716-446655440000',reason:'listing_coordinate_conflict',status:502});
        const events=[end-2000,end-1000,undefined,end+1].map(timestamp=>({timestamp,$metadata:{service:'localley-next',url:'https://www.localley.io/api/spots/PRIVATEID/photos?token=PRIVATEBYTES',message:photo,timestampNs:'PRIVATEBYTES'},$workers:{event:{response:{status:502}}}}));
        return new Response(JSON.stringify({success:true,result:{run:{status:'COMPLETED'},statistics:{abr_level:10},events:{count:4,events}}}));
      }if(String(url).includes('/api/cities?'))return new Response(JSON.stringify({success:true,total:1,cities:[{slug:'seoul',spotCount:1,status:'beta'}]}));return new Response('ok');};`;
    const path=join(directory,'report.json');
    const run=spawnSync(process.execPath,['--import','data:text/javascript;base64,'+Buffer.from(preload).toString('base64'),'scripts/check-production-health.mjs','--report',path],{env:{...process.env,CLOUDFLARE_API_TOKEN:'fixture-token'},encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);const r=JSON.parse(await readFile(path,'utf8'));const now=Date.parse(r.checkedAt);
    assert.equal(r.logs.observedEvents,4);assert.equal(r.logs.top5.length,1);assert.equal(r.logs.top5[0].count,4);assert.equal(r.logs.photoFailures.length,1);assert.equal(r.logs.photoFailures[0].count,4);
    const expected={firstSeen:new Date(now-2000).toISOString(),lastSeen:new Date(now-1000).toISOString(),knownCount:2,unknownCount:2,scope:'returned_events_only'};
    assert.deepEqual(r.logs.eventTimes,expected);assert.deepEqual(r.logs.top5[0].eventTimes,expected);assert.deepEqual(r.logs.photoFailures[0].eventTimes,expected);assert.equal(r.logs.errorClasses[0].count,4);assert.ok(r.logs.coverageWarnings.includes('query_sampled'));assert.doesNotMatch(JSON.stringify(r)+run.stdout,/PRIVATEID|PRIVATEBYTES|fixture-token/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
