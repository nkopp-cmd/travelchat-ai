import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type Row = Record<string, unknown>;
const m=vi.hoisted(()=>({actor:'alice' as string|null,rows:{} as Record<string,Row[]>,calls:[] as {role:string;table:string;op:string;fields:string}[],failStats:false}));
class Query {
  op='select'; fields='*'; values:Row[]=[]; filters:((r:Row)=>boolean)[]=[]; head=false;
  constructor(private role:string,private table:string){}
  select(fields='*',options?:{head?:boolean}){this.fields=fields;this.head=!!options?.head;return this;}
  insert(value:Row|Row[]){this.op='insert';this.values=Array.isArray(value)?value:[value];return this;}
  update(value:Row){this.op='update';this.values=[value];return this;}
  delete(){this.op='delete';return this;}
  eq(k:string,v:unknown){this.filters.push(r=>r[k]===v);return this;}
  in(k:string,v:unknown[]){this.filters.push(r=>v.includes(r[k]));return this;}
  order(){return this;} range(){return this;}
  private allowed(row:Row){
    if(this.role==='service')return true;
    if(this.table==='spots'||this.table==='challenges')return this.op==='select';
    if(this.table==='users')return row.clerk_id===m.actor;
    if(this.table==='itineraries')return row.clerk_user_id===m.actor||(this.op==='select'&&row.is_public===true);
    if(this.table==='saved_itineraries')return row.clerk_user_id===m.actor;
    if(this.table==='spot_reviews')return this.op==='select'||row.clerk_user_id===m.actor;
    return true;
  }
  private execute(single=false){
    m.calls.push({role:this.role,table:this.table,op:this.op,fields:this.fields});
    if(m.failStats&&this.table==='spots'&&this.op==='update')return {data:null,error:{code:'offline'},count:null};
    const all=m.rows[this.table]??=[];let selected=all.filter(r=>this.filters.every(f=>f(r))&&this.allowed(r));
    if(this.op==='insert'){
      selected=this.values.map((v,i)=>({id:'new-'+all.length+'-'+i,...v}));
      if(selected.some(r=>!this.allowed(r)))return {data:null,error:{code:'42501'},count:null};
      all.push(...selected);
    }else if(this.op==='update')selected.forEach(r=>Object.assign(r,this.values[0]));
    else if(this.op==='delete')m.rows[this.table]=all.filter(r=>!selected.includes(r));
    const projected=selected.map(r=>this.fields==='*'?{...r}:Object.fromEntries(this.fields.split(',').map(x=>x.trim()).filter(Boolean).map(k=>[k,r[k]])));
    return {data:this.head?null:single?(projected[0]??null):projected,error:null,count:selected.length};
  }
  single(){return Promise.resolve(this.execute(true));} maybeSingle(){return Promise.resolve(this.execute(true));}
  then(resolve:(v:ReturnType<Query['execute']>)=>unknown,reject:(r:unknown)=>unknown){return Promise.resolve(this.execute()).then(resolve,reject);}
}
vi.mock('@/lib/auth/server',()=>({auth:async()=>({userId:m.actor})}));
vi.mock('@/lib/supabase-server',()=>({createSupabaseServerClient:async()=>({from:(t:string)=>new Query('user',t)})}));
vi.mock('@/lib/supabase',()=>({createSupabaseAdmin:()=>({from:(t:string)=>new Query('service',t)})}));
vi.mock('@/lib/engagement-tracking',()=>({trackEngagement:vi.fn()}));
vi.mock('@/lib/app-data/preview-itinerary-likes',()=>({isPreviewItineraryLikeCandidate:()=>false}));
vi.mock('@/lib/app-data/preview-spot-reviews',()=>({isPreviewSpotReviewCandidate:()=>false}));
import * as likes from '@/app/api/itineraries/[id]/like/route';
import {GET as backgrounds} from '@/app/api/itineraries/[id]/ai-backgrounds/route';
import {POST as duplicate} from '@/app/api/itineraries/[id]/duplicate/route';
import {GET as friends} from '@/app/api/friends/route';
import {GET as savedTrips} from '@/app/api/user/saved-itineraries/route';
import {GET as exportTrip} from '@/app/api/itineraries/[id]/export/route';
import {POST as review} from '@/app/api/spots/[id]/reviews/route';
import {PUT as editReview,DELETE as deleteReview} from '@/app/api/spots/[id]/reviews/[reviewId]/route';
const req=(path:string,method='GET',body?:Row)=>new NextRequest('https://www.localley.io'+path,{method,...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});
const params=()=>({params:Promise.resolve({id:'trip'})});
const reviewParams=()=>({params:Promise.resolve({id:'spot',reviewId:'review-a'})});
beforeEach(()=>{m.actor='alice';m.calls=[];m.failStats=false;m.rows={
  users:[{id:'a',clerk_id:'alice',username:'Alice',xp:0,level:1,email:'private-a@example.test'},{id:'b',clerk_id:'bob',username:'Bob',xp:10,level:2,email:'private-b@example.test'}],
  itineraries:[{id:'trip',clerk_user_id:'bob',shared:true,is_public:false,title:'Shared route',city:'Seoul',days:1,activities:[],like_count:1}],
  saved_itineraries:[{id:'like-b',clerk_user_id:'carol',itinerary_id:'trip'}],
  follows:[{following_id:'bob',follower_id:'alice',created_at:'2026-10-17'}],
  spots:[{id:'spot',review_count:1,average_rating:2}],
  spot_reviews:[{id:'review-b',spot_id:'spot',clerk_user_id:'bob',rating:2}],
};});
describe('Source readers with owner RLS',()=>{
 it('likes another owner shared trip and stores the full aggregate without editing personal data',async()=>{
  const r=await likes.POST(req('/api/itineraries/trip/like','POST'),params());expect(r.status).toBe(200);expect(await r.json()).toMatchObject({liked:true,likeCount:2});
  expect(m.rows.itineraries[0]).toMatchObject({title:'Shared route',clerk_user_id:'bob',like_count:2});expect(m.rows.saved_itineraries[1].clerk_user_id).toBe('alice');
 });
 it('refuses private foreign likes before personal writes',async()=>{m.rows.itineraries[0].shared=false;expect((await likes.POST(req('/x','POST'),params())).status).toBe(403);expect(m.rows.saved_itineraries).toHaveLength(1);});
 it('does not expose private foreign counts through GET',async()=>{m.rows.itineraries[0].shared=false;expect((await likes.GET(req('/x'),params())).status).toBe(403);expect(m.calls.some(x=>x.table==='saved_itineraries')).toBe(false);});
 it('removes an old like after sharing stops without disclosing the private count',async()=>{m.rows.itineraries[0].shared=false;m.rows.saved_itineraries.push({id:'like-a',clerk_user_id:'alice',itinerary_id:'trip'});const r=await likes.DELETE(req('/x','DELETE'),params());expect(r.status).toBe(200);expect(await r.json()).toEqual({liked:false,likeCount:0});expect(m.rows.itineraries[0].like_count).toBe(1);expect(m.rows.saved_itineraries).toHaveLength(1);});
 it('copies a shared trip through an owner insert using only actual Source columns',async()=>{const r=await duplicate(req('/x','POST'),params());expect(r.status).toBe(200);const copy=m.rows.itineraries[1];expect(copy).toMatchObject({clerk_user_id:'alice',shared:false,is_public:false,activities:[]});expect(copy).not.toHaveProperty('daily_plans');expect(copy).not.toHaveProperty('preferences');expect(m.rows.itineraries[0].clerk_user_id).toBe('bob');});
 it('refuses copying a private foreign trip',async()=>{m.rows.itineraries[0].shared=false;expect((await duplicate(req('/x','POST'),params())).status).toBe(403);expect(m.rows.itineraries).toHaveLength(1);});
 it('preserves public friend names without exposing another owner email',async()=>{const r=await friends(req('/api/friends?type=following'));expect(r.status).toBe(200);const body=await r.json();expect(body.users[0]).toMatchObject({username:'Bob',level:2});expect(JSON.stringify(body)).not.toContain('private-b');expect(m.calls.filter(x=>x.table==='users')).toEqual([{role:'service',table:'users',op:'select',fields:'clerk_id, username, xp, level'}]);});
 it('keeps only owned bookmarks and shared trip details, with a public creator name',async()=>{m.rows.saved_itineraries.push({id:'like-a',clerk_user_id:'alice',itinerary_id:'trip'});const r=await savedTrips(req('/api/user/saved-itineraries'));expect(r.status).toBe(200);const body=await r.json();expect(body.itineraries).toHaveLength(1);expect(body.itineraries[0]).toMatchObject({id:'trip',creatorName:'Bob',creatorAvatar:null});m.rows.itineraries[0].shared=false;expect((await (await savedTrips(req('/x'))).json()).itineraries).toHaveLength(0);});
 it('does not fetch another owner bookmarks',async()=>{expect((await (await savedTrips(req('/x'))).json()).itineraries).toHaveLength(0);expect(m.calls.some(x=>x.table==='itineraries')).toBe(false);});
 it('exports an explicitly shared trip but refuses a private foreign trip',async()=>{const r=await exportTrip(req('/api/itineraries/trip/export?format=json'),params());expect(r.status).toBe(200);m.rows.itineraries[0].shared=false;expect((await exportTrip(req('/api/itineraries/trip/export?format=json'),params())).status).toBe(403);});
 it('denies private background URLs to a foreign or anonymous viewer',async()=>{m.rows.itineraries[0].ai_backgrounds={cover:'https://private.example.test/owner-only.png'};for(const actor of ['alice',null]){m.actor=actor;const r=await backgrounds(req('/api/itineraries/trip/ai-backgrounds'),params());expect(r.status).toBe(404);expect(await r.text()).not.toContain('owner-only.png');}});
 it.each(['owner','published'])('retains authorized background URLs for %s',async kind=>{m.rows.itineraries[0].ai_backgrounds={cover:'https://private.example.test/owner-only.png'};if(kind==='owner')m.actor='bob';else m.rows.itineraries[0].is_public=true;const r=await backgrounds(req('/api/itineraries/trip/ai-backgrounds'),params());expect(r.status).toBe(200);expect((await r.json()).backgrounds.cover).toContain('owner-only.png');});
 it('creates an owned review and updates public spot stats through the server role',async()=>{const r=await review(req('/x','POST',{rating:4,comment:'Controlled test'}),{params:Promise.resolve({id:'spot'})});expect(r.status).toBe(201);expect(m.rows.spots[0]).toMatchObject({review_count:2,average_rating:3});expect(m.rows.spot_reviews[1].clerk_user_id).toBe('alice');expect(m.calls.filter(x=>x.table==='spots').every(x=>x.role==='service')).toBe(true);});
 it('updates and deletes only an owned review and refreshes its spot stats',async()=>{m.rows.spot_reviews.push({id:'review-a',spot_id:'spot',clerk_user_id:'alice',rating:4});expect((await editReview(req('/x','PUT',{rating:5}),reviewParams())).status).toBe(200);expect(m.rows.spots[0].average_rating).toBe(3.5);expect((await deleteReview(req('/x','DELETE'),reviewParams())).status).toBe(200);expect(m.rows.spots[0]).toMatchObject({review_count:1,average_rating:2});});
 it('refuses another spot review identity',async()=>{m.rows.spot_reviews.push({id:'review-a',spot_id:'other-spot',clerk_user_id:'alice',rating:4});expect((await editReview(req('/x','PUT',{rating:5}),reviewParams())).status).toBe(404);expect(m.rows.spot_reviews[1].rating).toBe(4);});
 it('does not report successful stats after a server write failure',async()=>{m.failStats=true;expect((await review(req('/x','POST',{rating:4}),{params:Promise.resolve({id:'spot'})})).status).toBe(500);expect(m.rows.spots[0].review_count).toBe(1);});
 it('denies anonymous mutations before all database access',async()=>{m.actor=null;expect((await likes.POST(req('/x','POST'),params())).status).toBe(401);expect((await duplicate(req('/x','POST'),params())).status).toBe(401);expect((await review(req('/x','POST',{rating:4}),{params:Promise.resolve({id:'spot'})})).status).toBe(401);expect(m.calls).toHaveLength(0);});
});
