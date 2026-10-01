import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {repairFilters,targetId,marketTargetId,validateSnapshot,sourceFields,run} from './quarantine-source.mjs';
const row={id:targetId,name:{en:'Daesin-dong Old Town',ko:'대신동 구시가'},google_place_id:null,location:'0101000020E61000003FC6DCB584BC5F404694F6065FC84240',photos:['a','b','c'].map(x=>'/api/places/photo?name=places%2FChIJTwlXpoSifDURJOCAoUd4JoM%2Fphotos%2F'+x+'&w=1200')};
test('CAS scopes one known row, exact geography, name, NULL listing and TEXT[] original photos',()=>{const f=repairFilters(row);assert.equal(f.id,'eq.'+targetId);assert.equal(f.google_place_id,'is.null');assert.equal(f.location,'eq.'+row.location);assert.ok(f.photos.startsWith('eq.{"'));assert.ok(!f.photos.startsWith('eq.['));assert.equal(f.name,'eq.'+JSON.stringify(row.name));});
test('rollback only matches empty photos and the unchanged source identity',()=>{const f=repairFilters(row,true);assert.equal(f.photos,'eq.{}');assert.equal(f.id,'eq.'+targetId);assert.equal(f.location,'eq.'+row.location);});
test('refuses another owner, listing, renamed venue, unproven photo or changed point',()=>{for(const change of [{id:'other'},{name:{en:'Another venue'}},{google_place_id:'other'},{photos:['https://example.com/image']},{location:'POINT(0 0)'}])assert.throws(()=>validateSnapshot({...row,...change}));});

test('preservation check detects nested source changes while allowing photos only',()=>{assert.equal(sourceFields(row),sourceFields({...row,photos:[]}));assert.notEqual(sourceFields(row),sourceFields({...row,name:{...row.name,ko:'changed'}}));assert.notEqual(sourceFields({...row,tips:{en:'original'}}),sourceFields({...row,tips:{en:'changed'}}));});

const market={...row,id:marketTargetId,name:{en:'Janghanpyeong Antique Market',ko:'장한평 골동품시장'},location:'0101000020E610000095D4096822C45F401D5A643BDFC74240',tips:{en:'preserve'},photos:['a','b','c'].map(x=>'/api/places/photo?name=places%2FChIJk7CYh6ujfDURBm5z-rXPgbE%2Fphotos%2F'+x)};
const env={NEXT_PUBLIC_SUPABASE_URL:'https://llehrhqeolfprutcaopi.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
function backup(t){const dir=fs.mkdtempSync(path.join(process.cwd(),'.quarantine-test-'));t.after(()=>fs.rmSync(dir,{recursive:true}));const file=path.join(dir,'before.json');fs.writeFileSync(file,JSON.stringify(market),{mode:0o600});return file;}
function server(t,{initial=market,beforePatch,lostReply=false}={}){
 let current=structuredClone(initial);const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const u=new URL(url);assert.equal(u.hostname,'llehrhqeolfprutcaopi.supabase.co');assert.equal(u.pathname,'/rest/v1/spots');assert.equal(u.searchParams.get('id'),'eq.'+marketTargetId);
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
