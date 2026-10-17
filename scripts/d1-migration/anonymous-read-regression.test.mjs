import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousKey, anonymousCatalogSql, checkAnonymousReads, publicCatalogs, publicColumns } from './anonymous-read-regression.mjs';

const token = payload => ['e30',Buffer.from(JSON.stringify(payload)).toString('base64url'),'signature'].join('.');
const anonKey = token({ role: 'anon', ref: 'llehrhqeolfprutcaopi', exp: 4102444800 });
const credentials = { anonKey, accessToken: 'not-a-real-management-token' };
const table = name => ({ extension_mutations:[], name, kind: 'r', rls: true, anon_table_select: true, anon_column_select: true, anon_select_blocked:!publicCatalogs.includes(name), anon_insert_blocked:true, anon_update_blocked:true, anon_delete_blocked:true, anon_select_columns: publicColumns[name] ?? ['id'] });
const deniedTable = name => ({ ...table(name), anon_table_select: false, anon_column_select: false });
function fixture({ tables = [table('users'),table('messages')], counts = {}, statuses = {}, control = 200, catalogStatus = 200, catalogBody, permissionCodes = {} } = {}) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect,'error');
    if (url.includes('api.supabase.com')) {
      assert.equal(options.method,'POST');
      assert.equal(JSON.parse(options.body).query, anonymousCatalogSql);
      return new Response(catalogBody ?? JSON.stringify(tables),{ status: catalogStatus });
    }
    assert.equal(options.headers.apikey,anonKey);
    assert.equal(options.headers.Authorization,`Bearer ${anonKey}`);
    if (url.endsWith('/auth/v1/settings')) return new Response(null,{ status: control });
    assert.equal(options.method,'HEAD');
    assert.equal(options.headers.Prefer,'count=exact');
    const name = new URL(url).pathname.split('/').at(-1);
    assert.equal(new URL(url).searchParams.get('select'),publicColumns[name]?.join(',') ?? '*');
    assert.equal(new URL(url).searchParams.get('limit'),'0');
    if (statuses[name] === 'throw') throw Error('private upstream error must not appear');
    return new Response(null,{ status: statuses[name] ?? 200,
      headers: { ...(counts[name] === null ? {} : { 'content-range': counts[name] ?? '*/0' }), ...(permissionCodes[name] ? { 'proxy-status': `PostgREST; error=${permissionCodes[name]}` } : {}) } });
  };
  return { calls, request };
}

test('accepts only the pinned project anonymous JWT, never service-role or foreign keys', () => {
  assert(anonymousKey(anonKey));
  for (const key of [undefined,'', 'sb_secret_private', token({role:'service_role',ref:'llehrhqeolfprutcaopi'}),token({role:'anon',ref:'foreign'}),token({role:'anon'}),'not.a.key']) assert.equal(anonymousKey(key),false);
});
test('rejects unsafe credentials before any network request', async () => {
  let calls = 0; await assert.rejects(checkAnonymousReads({ ...credentials, anonKey: token({role:'service_role'}) },async()=>{calls++;}),/invalid_credentials/);assert.equal(calls,0);
});
test('all physical relations are probed with the actual anonymous key and HEAD, never row retrieval', async () => {
  const f=fixture({tables:[table('users'),table('messages'),table('new_private_table')]});
  const r=await checkAnonymousReads(credentials,f.request);
  assert.equal(r.state,'passed');assert.equal(r.relationCount,3);assert.equal(r.rowsRetrieved,0);assert.deepEqual(r.publicExceptions,[]);
  assert.deepEqual(f.calls.filter(c=>c.options.method==='HEAD').map(c=>new URL(c.url).pathname),['/rest/v1/users','/rest/v1/messages','/rest/v1/new_private_table']);
});
test('one visible PRIVATE row fails the entire run', async () => {
  const f=fixture({tables:[table('messages'),table('users')],counts:{users:'*/1'},statuses:{users:206}}),r=await checkAnonymousReads(credentials,f.request);
  assert.equal(r.state,'failed');assert.deepEqual(r.results.map(t=>t.state),['zero_rows','exposed_rows']);assert.equal(r.results[1].count,1);assert.equal(r.results[1].status,206);
});
test('permission denial is explicit and is never called a zero count', async () => {
  const f=fixture({tables:[deniedTable('users'),deniedTable('messages')],statuses:{users:403,messages:401},permissionCodes:{users:'42501',messages:'42501'}}),r=await checkAnonymousReads(credentials,f.request);
  assert.equal(r.state,'passed');assert(r.results.every(t=>t.state==='access_denied'&&t.count===null));
});
for (const count of [null,'*/*','0-0/0','*/-1','*/01','*/9007199254740992','*/0 garbage']) {
  test(`unknown or malformed count fails closed: ${String(count)}`,async()=>{
    const f=fixture({counts:{users:count}}),r=await checkAnonymousReads(credentials,f.request);
    assert.equal(r.state,'failed');assert.equal(r.results[0].state,'unknown');assert.equal(r.results[0].count,null);
  });
}
for (const status of [404,429,500,'throw']) {
  test(`unavailable relation remains a failure: ${status}`,async()=>{
    const f=fixture({statuses:{users:status}}),r=await checkAnonymousReads(credentials,f.request);
    assert.equal(r.state,'failed');assert.equal(r.results[0].count,null);assert(!JSON.stringify(r).includes('private upstream error'));
    assert.equal(f.calls.filter(c=>c.options.method==='HEAD').length,2,'continues other tables without retrying a failed table');
  });
}
test('a failed key control cannot turn blanket denials into a passing check',async()=>{
  const f=fixture({control:401,statuses:{users:403,messages:403}});await assert.rejects(checkAnonymousReads(credentials,f.request),/anonymous_key_control_unavailable/);assert.equal(f.calls.filter(c=>c.options.method==='HEAD').length,0);
});
for (const tables of [[],[table('users'),table('users')],[table('../users')],[{name:'users',kind:'r',rls:null}],Array.from({length:201},(_,i)=>table('table_'+i))]) {
  test('invalid or ambiguous physical catalog refuses incomplete coverage',async()=>{
    const f=fixture({tables});await assert.rejects(checkAnonymousReads(credentials,f.request),/invalid_catalog/);assert.equal(f.calls.length,1);
  });
}
test('catalog HTTP failure and malformed JSON never become zero tables',async()=>{
  await assert.rejects(checkAnonymousReads(credentials,fixture({catalogStatus:403}).request),/catalog_unavailable/);
  await assert.rejects(checkAnonymousReads(credentials,fixture({catalogBody:'malformed private diagnostics'}).request));
});
test('catalog includes ordinary, partitioned, foreign, view and materialized relations; only extension-owned relations are excluded',async()=>{
  assert.match(anonymousCatalogSql,/pg_catalog\.pg_depend/);assert.match(anonymousCatalogSql,/d\.deptype='e'/);
  const tables=['r','p','f','v','m'].map((kind,i)=>({...table('relation_'+i),kind}));
  const r=await checkAnonymousReads(credentials,fixture({tables}).request);assert.equal(r.relationCount,5);assert.equal(r.state,'passed');
});

test('expired and missing-expiry anonymous tokens fail before any request',async()=>{
  for(const exp of [undefined,0,1,Math.floor(Date.now()/1000)-1,'4102444800']){
    let calls=0;await assert.rejects(checkAnonymousReads({...credentials,anonKey:token({role:'anon',ref:'llehrhqeolfprutcaopi',exp})},async()=>{calls++;}),/invalid_credentials/);assert.equal(calls,0);
  }
});
for(const code of ['PGRST301','PGRST303',undefined]){
  test(`JWT failure or missing permission proof cannot pass: ${code}`,async()=>{
    const f=fixture({statuses:{users:401,messages:401},permissionCodes:{users:code,messages:code}}),r=await checkAnonymousReads(credentials,f.request);
    assert.equal(r.state,'failed');assert(r.results.every(x=>x.state==='unknown'&&x.count===null));
  });
}

test('only the nine approved public catalogs may return visible counts',async()=>{
  assert.deepEqual(publicCatalogs,['challenges','geo_aliases','geo_countries','geo_destinations','geo_local_area_vibe_scores','geo_local_areas','geo_vibe_taxonomy','spots','transfer_edges']);
  assert(Object.isFrozen(publicCatalogs));
  const tables=[table('users'),...publicCatalogs.map(table)],counts=Object.fromEntries(publicCatalogs.map(name=>[name,'*/4']));
  const r=await checkAnonymousReads(credentials,fixture({tables,counts}).request);
  assert.equal(r.state,'passed');assert.equal(r.privateRelationCount,1);assert.deepEqual(r.publicExceptions,publicCatalogs);
  assert(r.results.slice(1).every(x=>x.state==='public_catalog'&&x.count===4));
});
test('new or lookalike relations stay private and cannot use a public exception',async()=>{
  const tables=[table('new_private_table'),table('spots_private'),table('users')],counts={new_private_table:'*/1',spots_private:'*/1',users:'*/1'};
  const r=await checkAnonymousReads(credentials,fixture({tables,counts}).request);
  assert.equal(r.state,'failed');assert.equal(r.privateRelationCount,3);assert.deepEqual(r.publicExceptions,[]);assert(r.results.every(x=>x.state==='exposed_rows'));
});
test('public catalog denial fails the availability contract instead of hiding it as protected',async()=>{
  const r=await checkAnonymousReads(credentials,fixture({tables:[deniedTable('spots')],statuses:{spots:401},permissionCodes:{spots:'42501'}}).request);
  assert.equal(r.state,'failed');assert.equal(r.results[0].state,'access_denied');assert.equal(r.results[0].expectedAccess,'public_catalog');
});

test('SELECT-star denial cannot hide an anonymously readable column',async()=>{
  const r=await checkAnonymousReads(credentials,fixture({tables:[{...table('users'),anon_table_select:false,anon_column_select:true}],statuses:{users:401},permissionCodes:{users:'42501'}}).request);
  assert.equal(r.state,'failed');assert.equal(r.results[0].state,'unknown');assert.equal(r.results[0].anon_column_select,true);
});
test('contradictory table/column grants fail closed on permission denial',async()=>{
  const r=await checkAnonymousReads(credentials,fixture({tables:[{...table('users'),anon_table_select:true,anon_column_select:false}],statuses:{users:401},permissionCodes:{users:'42501'}}).request);
  assert.equal(r.state,'failed');assert.equal(r.results[0].state,'unknown');
});
for(const field of ['anon_table_select','anon_column_select']){
  test(`missing or nonboolean privilege metadata refuses the catalog: ${field}`,async()=>{
    for(const value of [undefined,null,'false',0]){
      const f=fixture({tables:[{...table('users'),[field]:value}]});await assert.rejects(checkAnonymousReads(credentials,f.request),/invalid_catalog/);assert.equal(f.calls.length,1);
    }
  });
}

for (const command of ['insert','update','delete']) {
  test(`possible anonymous ${command} fails even when the private table is empty`,async()=>{
    const t={...table('follows'),[`anon_${command}_blocked`]:false};
    const r=await checkAnonymousReads(credentials,fixture({tables:[t]}).request);
    assert.equal(r.state,'failed');assert.equal(r.results[0].state,'zero_rows');assert.deepEqual(r.results[0].possibleWrites,[command]);
  });
  test(`public catalog anonymous ${command} also fails`,async()=>{
    const r=await checkAnonymousReads(credentials,fixture({tables:[{...table('spots'),[`anon_${command}_blocked`]:false}]}).request);
    assert.equal(r.state,'failed');assert.equal(r.results[0].state,'public_catalog');
  });
  test(`unknown ${command} protection refuses the catalog`,async()=>{
    for(const v of [null,undefined,'true',1])await assert.rejects(checkAnonymousReads(credentials,fixture({tables:[{...table('users'),[`anon_${command}_blocked`]:v}]}).request),/invalid_catalog/);
  });
}
for(const column of ['discovered_by','email','clerk_user_id','stripe_customer_id','source_meta','new_unreviewed_column']) {
  test(`public column contract refuses ${column}`,async()=>{
    const r=await checkAnonymousReads(credentials,fixture({tables:[{...table('spots'),anon_select_columns:[...publicColumns.spots,column]}]}).request);
    assert.equal(r.state,'failed');assert.deepEqual(r.results[0].unexpectedPublicColumns,[column]);
  });
}
test('partial public column grants are checked individually',async()=>{
  const r=await checkAnonymousReads(credentials,fixture({tables:[{...table('spots'),anon_table_select:false,anon_select_columns:['email']}]}).request);
  assert.equal(r.state,'failed');assert.deepEqual(r.results[0].unexpectedPublicColumns,['email']);
});
for(const columns of [undefined,null,{},['id','id'],['unsafe-column'],[1]])test('missing or malformed column metadata refuses incomplete proof',async()=>{
  await assert.rejects(checkAnonymousReads(credentials,fixture({tables:[{...table('users'),anon_select_columns:columns}]}).request),/invalid_catalog/);
});
test('public column contract is immutable and excludes owner and opaque metadata fields',()=>{
  assert(Object.isFrozen(publicColumns));for(const cols of Object.values(publicColumns)){assert(Object.isFrozen(cols));assert(!cols.includes('source_meta'));assert(!cols.includes('discovered_by'));}
});

test('extension-owned references cannot hide anonymous writes behind the read exclusion',async()=>{
 const extension_mutations=[{table:'spatial_ref_sys',kind:'r',insertBlocked:false,updateBlocked:false,deleteBlocked:false}];
 const r=await checkAnonymousReads(credentials,fixture({tables:[{...table('users'),extension_mutations}]}).request);
 assert.equal(r.state,'failed');assert.equal(r.mutationRelationCount,2);assert.equal(r.extensionResults[0].writesBlocked,false);assert.equal(r.applicationState,'passed');assert.equal(r.extensionMutationState,'failed');
});
test('readable extension reference objects pass only when every anonymous mutation is denied',async()=>{
 const extension_mutations=[{table:'spatial_ref_sys',kind:'r',insertBlocked:true,updateBlocked:true,deleteBlocked:true},{table:'geometry_columns',kind:'v',insertBlocked:true,updateBlocked:true,deleteBlocked:true}];
 const r=await checkAnonymousReads(credentials,fixture({tables:[{...table('users'),extension_mutations}]}).request);
 assert.equal(r.state,'passed');assert.equal(r.mutationRelationCount,3);assert.equal(r.relationCount,1);
});
test('missing, malformed or inconsistent extension mutation coverage fails closed',async()=>{
 const safe={table:'spatial_ref_sys',kind:'r',insertBlocked:true,updateBlocked:true,deleteBlocked:true};
 for(const extension_mutations of [undefined,null,{},[safe,safe],[{...safe,insertBlocked:null}],[{...safe,table:'../unsafe'}]])await assert.rejects(checkAnonymousReads(credentials,fixture({tables:[{...table('users'),extension_mutations}]}).request),/invalid_extension_mutation_catalog/);
 await assert.rejects(checkAnonymousReads(credentials,fixture({tables:[table('users'),{...table('messages'),extension_mutations:[safe]}]}).request),/invalid_extension_mutation_catalog/);
});

test('zero current rows cannot hide a potentially allowing private SELECT policy',async()=>{
 const r=await checkAnonymousReads(credentials,fixture({tables:[{...table('spot_reviews'),anon_select_blocked:false}]}).request);
 assert.equal(r.state,'failed');assert.equal(r.results[0].state,'zero_rows');assert.equal(r.results[0].privateReadBlocked,false);
});
test('missing private SELECT protection metadata refuses incomplete coverage',async()=>{
 for(const v of [undefined,null,1,'true'])await assert.rejects(checkAnonymousReads(credentials,fixture({tables:[{...table('users'),anon_select_blocked:v}]}).request),/invalid_catalog/);
});
