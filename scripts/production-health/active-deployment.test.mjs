import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditActiveDeployment, summarizeActiveDeployment } from './active-deployment.mjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const old='38d2d7e6-40ea-48df-9783-24a0a121ad10', active='d0f508f5-770a-4dc2-87f6-579a18a43185', id='6003f606-9242-4c0e-870d-039a20160922';
const deployment=(versions=[{version_id:active,percentage:100}])=>({deployments:[{id,created_on:'2026-10-18T02:50:00Z',versions,annotations:{private:'PRIVATEBYTES'}}]});
const summary={scope:'returned_events_only',totalEvents:4,omittedEvents:0,versions:[{versionId:old,count:3},{versionId:active,count:1}]};
const json=data=>new Response(JSON.stringify(data));
test('real deployment identifies active traffic without reclassifying or dropping older returned events',()=>{
 const before=structuredClone(summary),r=summarizeActiveDeployment(deployment(),summary);
 assert.equal(r.available,true);assert.deepEqual(r.activeVersions,[{versionId:active,percentage:100,returnedWindowErrorEvents:1}]);
 assert.deepEqual(summary,before);assert.equal(r.scope,'configuration_at_inspection_only');
 assert.ok(r.coverageWarnings.includes('returned_events_may_predate_deployment'));assert.ok(r.coverageWarnings.includes('version_overrides_not_excluded'));assert.ok(r.coverageWarnings.includes('error_absence_not_proven'));
 assert.doesNotMatch(JSON.stringify(r),/PRIVATEBYTES|annotations/);
});
test('canary percentages and both configured versions remain separate',()=>{
 const r=summarizeActiveDeployment(deployment([{version_id:old.toUpperCase(),percentage:99},{version_id:active,percentage:1}]),summary);
 assert.deepEqual(r.activeVersions,[{versionId:old,percentage:99,returnedWindowErrorEvents:3},{versionId:active,percentage:1,returnedWindowErrorEvents:1}]);
});
test('zero returned events never certifies error absence; missing query and omitted versions stay unknown',()=>{
 const empty={scope:'returned_events_only',totalEvents:0,omittedEvents:0,versions:[]};
 assert.equal(summarizeActiveDeployment(deployment(),empty).activeVersions[0].returnedWindowErrorEvents,0);
 for(const v of [undefined,{}, {...empty,omittedEvents:4,totalEvents:4}])assert.equal(summarizeActiveDeployment(deployment(),v).activeVersions[0].returnedWindowErrorEvents,null);
 assert.ok(summarizeActiveDeployment(deployment(),empty).coverageWarnings.includes('error_absence_not_proven'));
});
test('refuses malformed, duplicate, incomplete or unbalanced traffic definitions without raw payloads',()=>{
 for(const versions of [[],[{version_id:active,percentage:99}],[{version_id:active,percentage:'100'}],[{version_id:'PRIVATEBYTES',percentage:100}],[{version_id:active,percentage:101}],[{version_id:active,percentage:0}],[{version_id:active,percentage:50},{version_id:active.toUpperCase(),percentage:50}]]){
  const r=summarizeActiveDeployment(deployment(versions),summary);assert.equal(r.available,false);assert.doesNotMatch(JSON.stringify(r),/PRIVATEBYTES/);
 }
 for(const data of [{},{deployments:[{...deployment().deployments[0],created_on:'PRIVATEBYTES'}]},{deployments:[{...deployment().deployments[0],id:'PRIVATEBYTES'}]}])assert.equal(summarizeActiveDeployment(data,summary).available,false);
});
test('GET uses the fixed account and service with deadline, never follows redirects or exposes API extras',async()=>{
 let calls=0;const r=await auditActiveDeployment('fixture-token',summary,async(url,options)=>{calls++;assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/664f242340bcec2f32daaeee15f58bde/workers/scripts/localley-next/deployments');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);assert.equal(options.headers.authorization,'Bearer fixture-token');return json({success:true,result:deployment(),extra:'PRIVATEBYTES'});});
 assert.equal(calls,1);assert.equal(r.available,true);assert.doesNotMatch(JSON.stringify(r),/fixture-token|PRIVATEBYTES/);
});
test('HTTP/envelope/transport failures remain unavailable with no lost existing health exit contract',async()=>{
 const failures=[()=>new Response('PRIVATEBYTES',{status:403}),()=>json({success:false,error:'PRIVATEBYTES'}),()=>json({success:true,result:deployment(),errors:['PRIVATEBYTES']}),()=>new Response('PRIVATEBYTES'),()=>{throw Error('PRIVATEBYTES')},()=>new Response(null)];
 for(const request of failures){const r=await auditActiveDeployment('fixture-token',summary,request);assert.equal(r.available,false);assert.doesNotMatch(JSON.stringify(r),/PRIVATEBYTES|fixture-token/);}
 assert.equal((await auditActiveDeployment('',summary,()=>assert.fail())).available,false);
});
test('oversized bodies are bounded, canceled and never serialized',async()=>{
 let canceled=false;const r=await auditActiveDeployment('fixture-token',summary,()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(65537));},cancel(){canceled=true;}})));
 assert.equal(r.available,false);assert.equal(canceled,true);
});
test('actual CLI adds deployment context without hiding sampled old errors or changing uptime exits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'localley-active-deployment-'));
 try{
 const preload=`globalThis.fetch=async(url,options)=>{
  const u=String(url);
  if(u.endsWith('/script-settings'))return new Response(JSON.stringify({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:true,persist:true}}}}));
  if(u.endsWith('/deployments'))return new Response(JSON.stringify({success:true,result:${JSON.stringify(deployment())}}));
  if(u.includes('/telemetry/query')){const q=JSON.parse(options.body);return new Response(JSON.stringify({success:true,result:{run:{status:'COMPLETED'},statistics:{abr_level:10},events:{count:1,events:[{timestamp:q.timeframe.to,$metadata:{service:'localley-next',url:'https://www.localley.io/dashboard?PRIVATEBYTES',message:'Network connection lost.'},$workers:{scriptVersion:{id:'${old}'}}}]}}}));}
  if(u.includes('/api/cities'))return new Response(JSON.stringify({success:true,total:1,cities:[{slug:'seoul',spotCount:1,status:'beta'}]}));
  return new Response('complete public body');};`;
 await writeFile(join(dir,'preload.mjs'),preload);
 const destination=join(dir,'report.json');const r=spawnSync(process.execPath,['--import',join(dir,'preload.mjs'),'scripts/check-production-health.mjs','--report',destination],{cwd:process.cwd(),env:{...process.env,CLOUDFLARE_API_TOKEN:'fixture-token'},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const report=JSON.parse(await readFile(destination));assert.equal(report.activeDeployment.available,true);assert.equal(report.activeDeployment.activeVersions[0].returnedWindowErrorEvents,0);assert.equal(report.logs.observedEvents,1);assert.equal(report.logs.workerVersions.versions[0].versionId,old);assert.ok(report.logs.coverageWarnings.includes('query_sampled'));assert.ok(report.activeDeployment.coverageWarnings.includes('error_absence_not_proven'));assert.doesNotMatch(JSON.stringify(report)+r.stdout,/PRIVATEBYTES|fixture-token/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
