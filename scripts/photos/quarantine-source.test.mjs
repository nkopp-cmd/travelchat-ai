import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {repairFilters,hongjeTargetId,suyuTargetId,targetId,marketTargetId,caveTargetId,bookTargetId,gyozaTargetId,validateSnapshot,sourceFields,run} from './quarantine-source.mjs';
const row={id:targetId,name:{en:'Daesin-dong Old Town',ko:'대신동 구시가'},google_place_id:null,location:'0101000020E61000003FC6DCB584BC5F404694F6065FC84240',photos:['a','b','c'].map(x=>'/api/places/photo?name=places%2FChIJTwlXpoSifDURJOCAoUd4JoM%2Fphotos%2F'+x+'&w=1200')};
test('CAS scopes one known row, exact geography, name, NULL listing and TEXT[] original photos',()=>{const f=repairFilters(row);assert.equal(f.id,'eq.'+targetId);assert.equal(f.google_place_id,'is.null');assert.equal(f.location,'eq.'+row.location);assert.ok(f.photos.startsWith('eq.{"'));assert.ok(!f.photos.startsWith('eq.['));assert.equal(f.name,'eq.'+JSON.stringify(row.name));});
test('rollback only matches empty photos and the unchanged source identity',()=>{const f=repairFilters(row,true);assert.equal(f.photos,'eq.{}');assert.equal(f.id,'eq.'+targetId);assert.equal(f.location,'eq.'+row.location);});
test('refuses another owner, listing, renamed venue, unproven photo or changed point',()=>{for(const change of [{id:'other'},{name:{en:'Another venue'}},{google_place_id:'other'},{photos:['https://example.com/image']},{location:'POINT(0 0)'}])assert.throws(()=>validateSnapshot({...row,...change}));});

test('preservation check detects nested source changes while allowing photos only',()=>{assert.equal(sourceFields(row),sourceFields({...row,photos:[]}));assert.notEqual(sourceFields(row),sourceFields({...row,name:{...row.name,ko:'changed'}}));assert.notEqual(sourceFields({...row,tips:{en:'original'}}),sourceFields({...row,tips:{en:'changed'}}));});

const market={...row,id:marketTargetId,name:{en:'Janghanpyeong Antique Market',ko:'장한평 골동품시장'},location:'0101000020E610000095D4096822C45F401D5A643BDFC74240',tips:{en:'preserve'},photos:['a','b','c'].map(x=>'/api/places/photo?name=places%2FChIJk7CYh6ujfDURBm5z-rXPgbE%2Fphotos%2F'+x)};
const env={NEXT_PUBLIC_SUPABASE_URL:'https://llehrhqeolfprutcaopi.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
function backup(t,source=market){const dir=fs.mkdtempSync(path.join(process.cwd(),'.quarantine-test-'));t.after(()=>fs.rmSync(dir,{recursive:true}));const file=path.join(dir,'before.json');fs.writeFileSync(file,JSON.stringify(source),{mode:0o600});return file;}
function server(t,{initial=market,beforePatch,lostReply=false,expectedId=marketTargetId}={}){
 let current=structuredClone(initial);const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const u=new URL(url);assert.equal(u.hostname,'llehrhqeolfprutcaopi.supabase.co');assert.equal(u.pathname,'/rest/v1/spots');assert.equal(u.searchParams.get('id'),'eq.'+expectedId);
  const matchesPhotos=()=>!u.searchParams.has('photos')||u.searchParams.get('photos')==='eq.{'+current.photos.map(x=>'"'+x.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+'}';
  const method=options.method;calls.push({method,body:options.body,filters:Object.fromEntries(u.searchParams)});
  assert.equal(options.headers.Prefer,'return=representation,handling=strict,max-affected=1');
  if(method==='PATCH'){
   if(beforePatch)current=beforePatch(current);
   if(!matchesPhotos())return Response.json([]);
   const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body),['photos']);current={...current,...body};
   if(lostReply)throw Error('Lost reply');
   return Response.json([current]);
  }
  const matches=matchesPhotos();
  return Response.json(matches?[current]:[]);
 });
 return {calls,current:()=>current};
}
test('market incident pins its point and listing; unrelated venues and altered coordinates fail',()=>{
 validateSnapshot(market);assert.equal(repairFilters(market).id,'eq.'+marketTargetId);
 for(const change of [{id:'c80eace5-f44f-484f-b3f5-c16c8fe55ab6'},{location:row.location},{photos:row.photos}])assert.throws(()=>validateSnapshot({...market,...change}));
});
test('apply and guarded rollback preserve all nested fields and write only photos',async t=>{
 const file=backup(t);const api=server(t);
 const applied=await run('--apply',file,env,marketTargetId);assert.equal(applied.afterPhotos,0);assert.equal(sourceFields(api.current()),sourceFields(market));
 const restored=await run('--rollback',file,env,marketTargetId);assert.equal(restored.afterPhotos,3);assert.deepEqual(api.current(),market);
 assert.equal(api.calls.filter(c=>c.method==='PATCH').length,2);
});
test('unknown target or a backup from another incident makes no HTTP request',async t=>{
 const file=backup(t);const api=server(t);
 await assert.rejects(run('--apply',file,env,'other'),/Unreviewed/);
 await assert.rejects(run('--apply',file,env),/another incident/);
 assert.equal(api.calls.length,0);
});
test('changed nested fields or new enrichment refuses rollback before a write',async t=>{
 const file=backup(t);
 for(const initial of [{...market,photos:[],tips:{en:'later change'}},{...market,photos:['new verified photo']}]){
  const api=server(t,{initial});await assert.rejects(run('--rollback',file,env,marketTargetId));assert.equal(api.calls.filter(c=>c.method==='PATCH').length,0);
 }
});
test('CAS loses a race without overwriting newer photos or automatically retrying',async t=>{
 const file=backup(t);const api=server(t,{beforePatch:row=>({...row,photos:['new verified photo']})});
 await assert.rejects(run('--apply',file,env,marketTargetId),/reconcile before retry/);
 assert.deepEqual(api.current().photos,['new verified photo']);assert.equal(api.calls.filter(c=>c.method==='PATCH').length,1);
});
test('lost write reply is not retried; retained backup allows readback reconciliation',async t=>{
 const file=backup(t);const api=server(t,{lostReply:true});await assert.rejects(run('--apply',file,env,marketTargetId),/Lost reply/);
 assert.deepEqual(api.current().photos,[]);assert.equal(api.calls.filter(c=>c.method==='PATCH').length,1);assert.deepEqual(JSON.parse(fs.readFileSync(file)),market);
});
const cave={...row,id:caveTargetId,name:{en:'Okutama Nippara Caves',ja:'奥多摩日原鍾乳洞'},location:'0101000020E6100000DBF97E6ABC626140E25817B7D1E84140',tips:{en:'preserve cave fields'},photos:['a','b','c'].map(x=>'/api/places/photo?name=places%2FChIJU39aEIo1GWARC-QtJQ0DPqg%2Fphotos%2F'+x)};
test('cave incident pins name, point, null identity and rejected listing',()=>{
 validateSnapshot(cave);assert.equal(repairFilters(cave).id,'eq.'+caveTargetId);
 for(const change of [{name:market.name},{location:row.location},{google_place_id:'new verified listing'},{photos:market.photos}])assert.throws(()=>validateSnapshot({...cave,...change}));
});
test('cave apply and rollback preserve fields and accept only the selected backup',async t=>{
 const file=backup(t,cave);const api=server(t,{initial:cave,expectedId:caveTargetId});
 await assert.rejects(run('--apply',file,env,marketTargetId),/another incident/);assert.equal(api.calls.length,0);
 const applied=await run('--apply',file,env,caveTargetId);assert.equal(applied.afterPhotos,0);assert.equal(sourceFields(api.current()),sourceFields(cave));
 const restored=await run('--rollback',file,env,caveTargetId);assert.equal(restored.afterPhotos,3);assert.deepEqual(api.current(),cave);
});
test('cave rollback refuses changed fields or replacement photos before a write',async t=>{
 const file=backup(t,cave);
 for(const initial of [{...cave,photos:[],tips:{en:'later change'}},{...cave,photos:['new verified photo']}]){
  const api=server(t,{initial,expectedId:caveTargetId});await assert.rejects(run('--rollback',file,env,caveTargetId));assert.equal(api.calls.filter(c=>c.method==='PATCH').length,0);
 }
});
test('cave lost reply is never retried automatically',async t=>{
 const file=backup(t,cave);const api=server(t,{initial:cave,expectedId:caveTargetId,lostReply:true});
 await assert.rejects(run('--apply',file,env,caveTargetId),/Lost reply/);assert.deepEqual(api.current().photos,[]);assert.equal(api.calls.filter(c=>c.method==='PATCH').length,1);
});


for(const incident of [
 {id:bookTargetId,name:'Book Off',listing:'ChIJgxLkXxPnAGARWJN8WxTACJI',location:'0101000020E61000008CB96B09F9EE6040371AC05B20494140'},
 {id:gyozaTargetId,name:'Gyoza no Ohsho',listing:'ChIJGf7pKhfnAGARNHAmUvCD7C0',location:'0101000020E6100000A779C7293AF06040386744696F484140'},
]){
 const fixture={...row,id:incident.id,name:{en:incident.name},location:incident.location,tips:{en:'keep nested source data'},photos:['a','b','c'].map(x=>'/api/places/photo?name='+encodeURIComponent('places/'+incident.listing+'/photos/'+x))};
 test(incident.name+' pins exact name, point, null identity and rejected listing',()=>{
  validateSnapshot(fixture);assert.equal(repairFilters(fixture).id,'eq.'+incident.id);
  for(const change of [{name:{en:'Other branch'}},{location:row.location},{google_place_id:'verified replacement'},{photos:row.photos},{photos:fixture.photos.slice(0,2)}])assert.throws(()=>validateSnapshot({...fixture,...change}));
 });
 test(incident.name+' apply and guarded rollback preserve every other field',async t=>{
  const file=backup(t,fixture),api=server(t,{initial:fixture,expectedId:incident.id});
  const applied=await run('--apply',file,env,incident.id);assert.equal(applied.afterPhotos,0);assert.equal(sourceFields(api.current()),sourceFields(fixture));
  const restored=await run('--rollback',file,env,incident.id);assert.equal(restored.afterPhotos,3);assert.deepEqual(api.current(),fixture);
 });
 test(incident.name+' race refuses a changed source without overwriting it',async t=>{
  const file=backup(t,fixture),api=server(t,{initial:fixture,expectedId:incident.id,beforePatch:r=>({...r,photos:['new verified photo']})});
  await assert.rejects(run('--apply',file,env,incident.id),/Post-write row mismatch/);assert.deepEqual(api.current().photos,['new verified photo']);assert.equal(api.calls.filter(x=>x.method==='PATCH').length,1);
 });
 test(incident.name+' lost reply never retries and rollback refuses changed data',async t=>{
  const file=backup(t,fixture),api=server(t,{initial:fixture,expectedId:incident.id,lostReply:true});
  await assert.rejects(run('--apply',file,env,incident.id),/Lost reply/);assert.deepEqual(api.current().photos,[]);assert.equal(api.calls.filter(x=>x.method==='PATCH').length,1);
  const changed=server(t,{initial:{...fixture,photos:[],tips:{en:'changed after repair'}},expectedId:incident.id});
  await assert.rejects(run('--rollback',file,env,incident.id));assert.equal(changed.calls.filter(x=>x.method==='PATCH').length,0);
 });
}

const october12Incidents=[{"id": "040f2f34-6fc1-4133-a0fc-b0c31d90e55a", "name": {"en": "Don Muang Night Market", "th": "ตลาดกลางคืนดอนเมือง"}, "location": "0101000020E6100000D1915CFE432659406A4DF38E53D42B40", "listing": "ChIJH82FA02C4jAR674urr_0PMA"}, {"id": "0a71e061-d220-478c-b959-409de2cdbcdd", "name": {"en": "Popiah Cart (Jalan Hang Lekir)"}, "location": "0101000020E6100000AC10A0F0239059405B1D948B8C990140", "listing": "ChIJne3Wqdnx0TERbmnfVaGgKLs"}, {"id": "4b3b1600-9b3a-4021-b77c-32629445c6f2", "name": {"en": "Jurong Lake Gardens", "zh": "裕廊湖花园"}, "location": "0101000020E61000006DC5FEB27BEE59401B2FDD240681F53F", "listing": "ChIJWQLwKP0P2jER-AOMrDbkIW8"}];
for (const incident of october12Incidents) {
 const source={...row,id:incident.id,name:incident.name,location:incident.location,tips:{en:'preserve incident fields'},photos:['a','b','c'].map(x=>'/api/places/photo?name='+encodeURIComponent(`places/${incident.listing}/photos/${x}`))};
 test(`${incident.id} pins exact name, point, NULL identity and rejected listing`,()=>{
  validateSnapshot(source);assert.equal(repairFilters(source).id,'eq.'+incident.id);
  for(const change of [{name:market.name},{location:row.location},{google_place_id:'verified-replacement'},{photos:market.photos}])assert.throws(()=>validateSnapshot({...source,...change}));
 });
 test(`${incident.id} apply and mock rollback preserve all non-photo fields`,async t=>{
  const file=backup(t,source),api=server(t,{initial:source,expectedId:incident.id});
  assert.equal((await run('--apply',file,env,incident.id)).afterPhotos,0);
  assert.equal(sourceFields(api.current()),sourceFields(source));
  assert.equal((await run('--rollback',file,env,incident.id)).afterPhotos,3);
  assert.deepEqual(api.current(),source);
 });
 test(`${incident.id} refuses changed fields and later enrichment on rollback`,async t=>{
  const file=backup(t,source);
  for(const initial of [{...source,photos:[],tips:{en:'later change'}},{...source,photos:['verified replacement']}]){
   const api=server(t,{initial,expectedId:incident.id});await assert.rejects(run('--rollback',file,env,incident.id));
   assert.equal(api.calls.filter(c=>c.method==='PATCH').length,0);
  }
 });
 test(`${incident.id} refuses a photo race without retry`,async t=>{
  const file=backup(t,source),api=server(t,{initial:source,expectedId:incident.id,beforePatch:r=>({...r,photos:['verified replacement']})});
  await assert.rejects(run('--apply',file,env,incident.id),/reconcile before retry/);
  assert.equal(api.calls.filter(c=>c.method==='PATCH').length,1);assert.deepEqual(api.current().photos,['verified replacement']);
 });
 test(`${incident.id} retains backup after a lost reply and never retries`,async t=>{
  const file=backup(t,source),api=server(t,{initial:source,expectedId:incident.id,lostReply:true});
  await assert.rejects(run('--apply',file,env,incident.id),/Lost reply/);
  assert.equal(api.calls.filter(c=>c.method==='PATCH').length,1);assert.deepEqual(api.current().photos,[]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)),source);
 });
}

for(const [id,name,listing,location]of [
 [hongjeTargetId,'Hongje-dong Gimbap Alley','ChIJv8RchhSjfDURufEcsZHjwhA','0101000020E610000094F6065F98BC5F40A5BDC11726CB4240'],
 [suyuTargetId,'Suyu-ri Bossam Street','ChIJa97inWu8fDURmaPCx9FLATY','0101000020E61000008E06F01648C05F401A51DA1B7CD14240'],
]){
 const incident={...row,id,name:{en:name},location,tips:{en:'keep nested source fields'},photos:['a','b','c'].map(x=>'/api/places/photo?name=places%2F'+listing+'%2Fphotos%2F'+x)};
 test(name+' pins identity, point and rejected listing',()=>{validateSnapshot(incident);assert.equal(repairFilters(incident).id,'eq.'+id);for(const delta of [{id:marketTargetId},{name:row.name},{location:row.location},{google_place_id:listing},{photos:row.photos}])assert.throws(()=>validateSnapshot({...incident,...delta}));});
 test(name+' applies and rolls back only its pinned photo array',async t=>{const file=backup(t,incident),api=server(t,{initial:incident,expectedId:id});await assert.rejects(run('--apply',file,env,marketTargetId));assert.equal(api.calls.length,0);const applied=await run('--apply',file,env,id);assert.equal(applied.afterPhotos,0);assert.equal(sourceFields(api.current()),sourceFields(incident));const restored=await run('--rollback',file,env,id);assert.equal(restored.afterPhotos,3);assert.deepEqual(api.current(),incident);assert.equal(api.calls.filter(c=>c.method==='PATCH').length,2);});
}
