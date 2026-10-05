import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notificationInventory, sourceTable } from './notification-inventory.mjs';
const credentials = { sourceUrl: 'https://llehrhqeolfprutcaopi.supabase.co', sourceKey: 'source-test-only', cloudflareToken: 'cf-test-only' };
const json = (body, status=200, range) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type':'application/json', ...(range ? {'Content-Range':range}: {}) } });

test('distinguishes real empty/nonempty counts from inaccessible history', async () => {
  for (const [count,status] of [[0,200],[12,206]]) {
    const r = await sourceTable('notifications', credentials, async () => json([],status,`*/${count}`));
    assert.equal(r.state,'available');assert.equal(r.count,count);assert.equal(r.ownerCoverage,'unknown');
  }
  for (const status of [401,403,404,500]) {
    const r = await sourceTable('notifications', credentials, async () => json({code:'PGRST205',message:'Bearer secret-user-text'},status));
    assert.equal(r.count,null);assert.notEqual(r.state,'available');
    assert.equal(JSON.stringify(r).includes('secret-user-text'),false);
    if(status===404)assert.equal(r.state,'unavailable_in_data_api');
    if([401,403].includes(status))assert.equal(r.state,'access_denied');
    assert.equal(r.physicalTableState,'not_audited');
  }
});
test('rejects incomplete, unsafe and row-returning count responses', async () => {
  for(const range of [undefined,'*/*','*/-1','*/01','*/9007199254740992','0-0/12']) {
    const r=await sourceTable('notifications',credentials,async()=>json([],200,range));assert.equal(r.count,null);
  }
  const r=await sourceTable('notifications',credentials,async()=>json([{email:'private@example.test'}],200,'*/1'));
  assert.equal(r.state,'invalid_count_response');assert.equal(JSON.stringify(r).includes('private@example.test'),false);
});
test('caps hostile response bodies and excludes raw error payloads', async () => {
  const r=await sourceTable('notifications',credentials,async()=>json({message:'secret'.repeat(12000)},404));
  assert.equal(r.count,null);assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('pins project and table without following credential redirects', async () => {
  let requests=0;
  const fake=async(_url,options)=>{requests++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return json([],200,'*/0');};
  for(const sourceUrl of ['https://other.supabase.co','https://llehrhqeolfprutcaopi.supabase.co/evil','https://bad@llehrhqeolfprutcaopi.supabase.co','https://llehrhqeolfprutcaopi.supabase.co?key=x']) {
    await assert.rejects(sourceTable('notifications',{...credentials,sourceUrl},fake));
  }
  await assert.rejects(sourceTable('notifications;DELETE FROM users',credentials,fake));assert.equal(requests,0);
  await sourceTable('notifications',credentials,fake);assert.equal(requests,1);
});
function candidateRequest({control=true,hostile=false}={}) {
  const calls=[];
  const request=async(url,options)=>{
    calls.push({url,method:options.method,sql:options.body?JSON.parse(options.body).sql:null});
    if(new URL(url).hostname.endsWith('supabase.co'))return new URL(url).pathname.endsWith('/spots')&&control?json([],206,'*/3295'):json({code:'PGRST205',message:'secret'},404);
    const sql=JSON.parse(options.body).sql;
    assert.match(sql,/^(SELECT|PRAGMA) /);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
    let rows;
    if(sql.includes('sqlite_master')) rows=[{name:'preview_notification_preferences'},{name:'preview_notifications'}];
    else if(sql.startsWith('PRAGMA')) rows=[{name:hostile?'private email@host.test':'ownerId',type:'TEXT'}];
    else if(sql.includes('GROUP BY'))rows=[{source:'legacy-fixture',n:35}];
    else if(sql.includes('unclaimed'))rows=[{total:35,unclaimed:2}];
    else rows=[{n:0}];
    return json({success:true,result:[{success:true,results:rows}]});
  };
  return {request,calls};
}
test('inventories isolated schema/owners without approving parity or reading row values', async()=>{
  const {request,calls}=candidateRequest();const r=await notificationInventory(credentials,request);
  assert.equal(r.control.count,3295);assert.equal(r.source.length,3);assert.ok(r.source.every(x=>x.count===null));
  assert.equal(r.candidate.length,2);assert.equal(r.candidate[0].scope,'isolated_preview_only');
  assert.deepEqual(r.legacyOwners,{total:35,unclaimed:2});assert.deepEqual(r.historicalTablesPresent,[]);
  assert.equal(r.historicalParity,'unproven');assert.equal(r.cutoverReady,false);assert.equal(r.readOnly,true);
  assert.ok(calls.filter(x=>x.method==='GET').every(x=>new URL(x.url).searchParams.get('limit')==='0'));
  assert.equal(JSON.stringify(r).includes('secret'),false);assert.equal(JSON.stringify(r).includes('test-only'),false);
});
test('refuses missing privileged control and candidate credentials before treating errors as counts',async()=>{
  const {request,calls}=candidateRequest({control:false});await assert.rejects(notificationInventory(credentials,request),/source_control_unavailable/);
  assert.equal(calls.length,1);await assert.rejects(notificationInventory({...credentials,cloudflareToken:''},request),/missing_candidate_credentials/);
});
test('refuses malformed candidate schema instead of persisting arbitrary metadata',async()=>{
  await assert.rejects(notificationInventory(credentials,candidateRequest({hostile:true}).request),/invalid_candidate_schema/);
});
