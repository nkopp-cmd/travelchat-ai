// @vitest-environment node
// Run only inside source-owner-policy-proof.mjs, after real RLS is enabled.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { NextRequest } from 'next/server';
type Row=Record<string,unknown>;
const m=vi.hoisted(()=>({actor:'owner-a'}));
const key=process.env.LOCALLEY_SOURCE_OWNER_PROOF_KEY;
const enabled=!!key;
const name=`localley-source-owner-proof-${key}`;
function sql(query:string){return execFileSync('docker',['exec',name,'psql','-X','-v','ON_ERROR_STOP=1','-qAt','-U','postgres','-d','postgres','-c',query],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']}).trim();}
const ident=(s:string)=>{if(!/^[a-z_][a-z_0-9]*$/.test(s))throw Error('invalid_fixture_identifier');return '"'+s+'"';};
function literal(v:unknown,k=''):string{if(v===null||v===undefined)return 'NULL';if(typeof v==='boolean')return String(v);if(typeof v==='number'&&Number.isFinite(v))return String(v);if(Array.isArray(v)&&k!=='activities')return 'ARRAY['+v.map(x=>literal(x)).join(',')+']::text[]';return "'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'"+(typeof v==='object'?'::jsonb':'');}
class PgQuery{
 private op='select';private fields='*';private filters:string[]=[];private values:Row[]=[];private head=false;private sorting='';private paging='';
 constructor(private role:string,private table:string){}
 select(fields='*',opts?:{head?:boolean}){this.fields=fields;this.head=!!opts?.head;return this;}
 eq(k:string,v:unknown){this.filters.push(ident(k)+'='+literal(v));return this;}
 order(k:string,options?:{ascending?:boolean}){this.sorting=' ORDER BY '+ident(k)+(options?.ascending===false?' DESC':' ASC');return this;}
 range(from:number,to:number){if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<from)throw Error('invalid_fixture_range');this.paging=' LIMIT '+(to-from+1)+' OFFSET '+from;return this;}
 in(k:string,values:unknown[]){this.filters.push(ident(k)+' IN ('+values.map(v=>literal(v)).join(',')+')');return this;}
 insert(v:Row|Row[]){this.op='insert';this.values=Array.isArray(v)?v:[v];return this;}
 update(v:Row){this.op='update';this.values=[v];return this;}
 delete(){this.op='delete';return this;}
 private execute(single=false){
  const fields=this.fields==='*'?'*':this.fields.split(',').map(x=>ident(x.trim())).join(',');
  const table='public.'+ident(this.table),where=this.filters.length?' WHERE '+this.filters.join(' AND '):'';
  let command='SELECT '+fields+' FROM '+table+where+this.sorting+this.paging;
  if(this.op==='insert'){const keys=Object.keys(this.values[0]).filter(k=>this.values[0][k]!==undefined);command='INSERT INTO '+table+' ('+keys.map(ident).join(',')+') VALUES '+this.values.map(row=>'('+keys.map(k=>literal(row[k],k)).join(',')+')').join(',')+' RETURNING '+fields;}
  if(this.op==='update')command='UPDATE '+table+' SET '+Object.entries(this.values[0]).filter(([,v])=>v!==undefined).map(([k,v])=>ident(k)+'='+literal(v,k)).join(',')+where+' RETURNING '+fields;
  if(this.op==='delete')command='DELETE FROM '+table+where+' RETURNING '+fields;
  try{
   const text=sql(`BEGIN; SET LOCAL ROLE ${this.role}; SET LOCAL request.jwt.claims=${literal(JSON.stringify({sub:m.actor}))}; WITH q AS (${command}) SELECT json_build_object('data',COALESCE(json_agg(q),'[]'::json),'count',count(*)) FROM q; COMMIT;`);
   const j=JSON.parse(text);return {data:this.head?null:single?(j.data[0]??null):j.data,count:j.count,error:null};
  }catch{return {data:null,count:null,error:{code:'fixture_query_failed'}};}
 }
 single(){return Promise.resolve(this.execute(true));}maybeSingle(){return Promise.resolve(this.execute(true));}
 then(resolve:(x:ReturnType<PgQuery['execute']>)=>unknown,reject:(e:unknown)=>unknown){return Promise.resolve(this.execute()).then(resolve,reject);}
}
vi.mock('@/lib/auth/server',()=>({auth:async()=>({userId:m.actor})}));
vi.mock('@/lib/supabase-server',()=>({createSupabaseServerClient:async()=>({from:(t:string)=>new PgQuery(m.actor?'authenticated':'anon',t)})}));
vi.mock('@/lib/supabase',()=>({createSupabaseAdmin:()=>({from:(t:string)=>new PgQuery('service_role',t)})}));
vi.mock('@/lib/engagement-tracking',()=>({trackEngagement:vi.fn()}));
vi.mock('@/lib/app-data/preview-itinerary-likes',()=>({isPreviewItineraryLikeCandidate:()=>false}));
vi.mock('@/lib/app-data/preview-spot-reviews',()=>({isPreviewSpotReviewCandidate:()=>false}));
import {POST as like,DELETE as unlike} from '@/app/api/itineraries/[id]/like/route';
import {POST as duplicate} from '@/app/api/itineraries/[id]/duplicate/route';
import {POST as review,GET as publicReviews} from '@/app/api/spots/[id]/reviews/route';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const request=(method:string,body?:Row)=>new NextRequest('https://www.localley.io/api/controlled',{method,...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});
describe.skipIf(!enabled)('actual handlers against disposable owner RLS',()=>{
 beforeAll(()=>{
  if(!/^(?:[0-9]+-[0-9]+|local-[a-f0-9-]{36})$/.test(key!))throw Error('invalid_proof_key');
  const c=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];
  expect(c.Config.Labels['cyberlink.localley.source-owner-proof']).toBe(key);expect(c.Config.Labels.app).toBe('Localley');expect(c.HostConfig.NetworkMode).toBe('none');expect(c.Mounts.every((x:{Type:string})=>x.Type!=='volume')).toBe(true);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','disposable-fixture-only');
  vi.stubGlobal('fetch',()=>{throw Error('no_network_in_disposable_proof');});
 });
 beforeEach(()=>{m.actor='owner-a';sql(`TRUNCATE public.saved_itineraries,public.spot_reviews,public.messages,public.conversations,public.user_progress,public.user_challenges,public.itineraries,public.users,public.spots,public.challenges CASCADE;
  INSERT INTO users(id,clerk_id) VALUES('${id(1)}','owner-a'),('${id(2)}','owner-b');
  INSERT INTO spots(id,name) VALUES('${id(9)}','{"en":"Reserved fixture"}');
  INSERT INTO itineraries(id,clerk_user_id,user_id,shared,title,city,days,activities) VALUES('${id(2)}','owner-b','${id(2)}',true,'Shared fixture','Seoul',1,'[]');`);});
 it('likes and unlikes a foreign shared itinerary with actual server counters',async()=>{
  const params={params:Promise.resolve({id:id(2)})};expect((await like(request('POST'),params)).status).toBe(200);
  expect(sql(`SELECT like_count FROM itineraries WHERE id='${id(2)}'`)).toBe('1');expect(sql('SELECT clerk_user_id FROM saved_itineraries')).toBe('owner-a');
  expect((await unlike(request('DELETE'),params)).status).toBe(200);expect(sql(`SELECT like_count FROM itineraries WHERE id='${id(2)}'`)).toBe('0');expect(sql('SELECT count(*) FROM saved_itineraries')).toBe('0');
 });
 it('counts all owners through the server after personal saved rows become private',async()=>{
  sql(`INSERT INTO saved_itineraries(clerk_user_id,itinerary_id) VALUES('owner-c','${id(2)}')`);
  const r=await like(request('POST'),{params:Promise.resolve({id:id(2)})});expect(r.status).toBe(200);expect((await r.json()).likeCount).toBe(2);
  expect(sql(`SELECT like_count FROM itineraries WHERE id='${id(2)}'`)).toBe('2');
 });
 it('removes an old private like without leaking other owners or deleting their rows',async()=>{
  sql(`INSERT INTO saved_itineraries(clerk_user_id,itinerary_id) VALUES('owner-a','${id(2)}'),('owner-c','${id(2)}'); UPDATE itineraries SET shared=false WHERE id='${id(2)}'`);
  const r=await unlike(request('DELETE'),{params:Promise.resolve({id:id(2)})});expect(r.status).toBe(200);expect((await r.json()).likeCount).toBe(0);
  expect(sql('SELECT clerk_user_id FROM saved_itineraries')).toBe('owner-c');expect(sql(`SELECT like_count FROM itineraries WHERE id='${id(2)}'`)).toBe('1');
 });
 it('duplicates shared content through an actual owner insert without invented columns',async()=>{
  const r=await duplicate(request('POST'),{params:Promise.resolve({id:id(2)})});expect(r.status).toBe(200);expect(sql("SELECT count(*) FROM itineraries WHERE clerk_user_id='owner-a' AND shared=false AND is_public=false")).toBe('1');
 });
 it('refuses private foreign likes and copies without a write',async()=>{
  sql(`UPDATE itineraries SET shared=false WHERE id='${id(2)}'`);const params={params:Promise.resolve({id:id(2)})};expect((await like(request('POST'),params)).status).toBe(403);expect((await duplicate(request('POST'),params)).status).toBe(403);expect(sql('SELECT count(*) FROM itineraries')).toBe('1');expect(sql('SELECT count(*) FROM saved_itineraries')).toBe('0');
 });
 it('serves the bounded public review projection while raw anonymous review reads are denied',async()=>{
  m.actor='';sql(`UPDATE users SET username='Public author',email='private-author@preview.localley.test' WHERE clerk_id='owner-b';INSERT INTO spot_reviews(spot_id,clerk_user_id,rating,comment) VALUES('${id(9)}','owner-b',4,'Public fixture review')`);
  expect(()=>sql('BEGIN;SET LOCAL ROLE anon;SELECT * FROM spot_reviews;ROLLBACK;')).toThrow();
  const r=await publicReviews(request('GET'),{params:Promise.resolve({id:id(9)})});expect(r.status).toBe(200);
  const body=await r.json();expect(body.total).toBe(1);expect(body.averageRating).toBe(4);expect(body.reviews[0].comment).toBe('Public fixture review');expect(body.reviews[0].user.name).toBe('Public author');expect(body.reviews[0].user_voted).toBe(false);expect(JSON.stringify(body)).not.toContain('private-author@');
 });
 it('creates an owned review and really updates a read-only public spot through the server role',async()=>{
  const r=await review(request('POST',{rating:4,comment:'Synthetic proof only'}),{params:Promise.resolve({id:id(9)})});expect(r.status).toBe(201);expect(sql(`SELECT review_count||'|'||average_rating FROM spots WHERE id='${id(9)}'`)).toBe('1|4');expect(sql('SELECT clerk_user_id FROM spot_reviews')).toBe('owner-a');
 });
});
