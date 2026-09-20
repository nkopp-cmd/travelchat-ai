import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

test('native Luna itineraries validate IDs and retain usage before owned persistence', async t => {
  const owner = 'fixture-owner', profile = randomUUID(), one = randomUUID(), two = randomUUID();
  const compiled = await build({ stdin: { contents: `import { itineraries } from './src/itineraries.ts'; export default { async fetch(r,e) {
    return itineraries(r, {...e, OPENAI_API_KEY:'offline-key'}, ${JSON.stringify({ownerId:owner,authUserId:'user',sessionId:'session',userRecordId:profile})}, await r.json()); } };`,
    resolveDir: process.cwd(), sourcefile: 'ai-itinerary-fixture.ts' }, bundle:true,write:false,format:'esm',platform:'browser' });
  const state = await mkdtemp(join(tmpdir(),'localley-ai-plan-'));
  let calls=0, reply, beforeReply=async()=>{};
  const mf = new Miniflare({workers:[{config:{name:'ai-plan-fixture',type:'worker',compatibilityDate:'2026-09-07',
    manifest:{mainModule:'fixture.mjs',modulesRoot:resolve('test'),modules:{'fixture.mjs':{type:'esm',contents:compiled.outputFiles[0].text}}},
    env:{DB:{type:'d1',id:'ai-plan-fixture',dev:{remote:false}}}},dev:{outboundService:{type:'fetcher',handler:async request=>{
      calls++; const body=await request.json(); assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.text.format.type,'json_schema');
      assert.equal(body.store,false);assert.equal(body.max_output_tokens,1200);await beforeReply();return Response.json(reply);
    }}}}],resourcePersistencePath:state,resourceTmpPath:state,telemetry:{enabled:false},cf:false,logRequests:false,unsafeLocalExplorer:false});
  const payload = {city:'Seoul',days:2,mode:'ai',preferences:'A relaxed pace'};
  const call = body=>mf.dispatchFetch('https://local.test/api/itineraries/generate',{method:'POST',body:JSON.stringify(body??payload)});
  const response = (plan, overrides={}) => ({id:'resp_fixture',model:'gpt-5.6-luna',status:'completed',
    usage:{input_tokens:100,output_tokens:40,input_tokens_details:{cached_tokens:20}},
    output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(plan)}]}],...overrides});
  const plan = {days:[{day:1,spotIds:[one]},{day:2,spotIds:[two]}]};
  try {
    const db=await mf.getD1Database('DB');
    for(const m of ['0001_local.sql','0002_application.sql','0004_pilot_catalog.sql','0005_itineraries.sql','0009_itinerary_share.sql','0010_ai_requests.sql','0011_ai_receipts.sql']) await db.exec(await readFile(`migrations/${m}`,'utf8'));
    await db.exec("INSERT INTO user VALUES ('user','Fixture','fixture@example.test',1,NULL,0,0); INSERT INTO owners VALUES ('fixture-owner','new'); INSERT INTO identity_links VALUES ('user','fixture-owner'); INSERT INTO session VALUES ('session','token','user',9999999999999,0,0,NULL,NULL);");
    await db.prepare('INSERT INTO profiles VALUES (?,?)').bind(profile,owner).run();
    for(const [id,name] of [[one,'Palace'],[two,'Market']]) await db.prepare("INSERT INTO spots(id,name,description,category,visible,city,address,latitude,longitude) VALUES (?,?,'{}','culture',1,'Seoul','Source address',37.5,126.9)").bind(id,JSON.stringify({en:name})).run();
    const count=async()=> (await db.prepare('SELECT count(*) AS n FROM itineraries').first()).n;
    await t.test('valid AI plan saves catalog facts, owned draft and token receipt',async()=>{
      reply=response(plan);const r=await call();assert.equal(r.status,201);const data=await r.json();
      assert.equal(data.generation.model,'gpt-5.6-luna');assert.equal(data.itinerary.ownerId,owner);
      assert.equal(data.itinerary.activities[0].activities[0].name,'Palace');assert.equal(data.itinerary.activities[0].activities[0].lat,37.5);
      const receipt=await db.prepare('SELECT * FROM native_ai_requests').first();
      assert.equal(receipt.input_tokens,100);assert.equal(receipt.output_tokens,40);assert.equal(receipt.cached_input_tokens,20);assert.equal(receipt.response_id,'resp_fixture');assert.equal(receipt.purpose,'itinerary');assert.equal(receipt.state,'completed');
    });
    for(const [name,bad] of [['invented ID',{days:[{day:1,spotIds:[randomUUID()]},{day:2,spotIds:[two]}]}],
      ['duplicate visit',{days:[{day:1,spotIds:[one]},{day:2,spotIds:[one]}]}],['missing day',{days:[{day:1,spotIds:[one]}]}],
      ['invented fields',{days:[{day:1,spotIds:[one],cost:'$10'},{day:2,spotIds:[two]}]}]]) {
      await t.test(`reject ${name} without saving`,async()=>{const n=await count();reply=response(bad);assert.equal((await call()).status,502);assert.equal(await count(),n);});
    }
    await t.test('incomplete provider output retains usage but never saves',async()=>{
      reply=response(plan,{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},id:'resp_partial'});
      const n=await count();assert.equal((await call()).status,502);assert.equal(await count(),n);
      const r=await db.prepare("SELECT * FROM native_ai_requests WHERE response_id='resp_partial'").first();assert.equal(r.state,'unknown');assert.equal(r.output_tokens,40);
    });
    await t.test('missing usage stays null rather than invented zero',async()=>{
      reply=response(plan,{usage:undefined,id:'resp_no_usage'});assert.equal((await call()).status,201);
      const r=await db.prepare("SELECT * FROM native_ai_requests WHERE response_id='resp_no_usage'").first();assert.equal(r.input_tokens,null);assert.equal(r.output_tokens,null);assert.equal(r.cached_input_tokens,null);
    });
    await t.test('insufficient places rejects before provider call',async()=>{
      const before=calls;assert.equal((await call({...payload,days:3})).status,422);assert.equal(calls,before);
    });
    await t.test('invalid token counts remain unknown rather than coerced',async()=>{
      reply=response(plan,{id:'resp_bad_usage',usage:{input_tokens:5,output_tokens:-1,input_tokens_details:{cached_tokens:6}}});
      assert.equal((await call()).status,201);
      const r=await db.prepare("SELECT * FROM native_ai_requests WHERE response_id='resp_bad_usage'").first();assert.equal(r.input_tokens,5);assert.equal(r.output_tokens,null);assert.equal(r.cached_input_tokens,null);
    });
    await t.test('hidden spot during provider wait prevents persistence',async()=>{
      reply=response(plan);beforeReply=()=>db.prepare('UPDATE spots SET visible=0 WHERE id=?').bind(one).run();
      const n=await count();assert.equal((await call()).status,409);assert.equal(await count(),n);
      beforeReply=async()=>{};await db.prepare('UPDATE spots SET visible=1 WHERE id=?').bind(one).run();
    });
    await t.test('revoked session during provider wait prevents persistence',async()=>{
      beforeReply=()=>db.exec("DELETE FROM session WHERE id='session';");const n=await count();assert.equal((await call()).status,409);assert.equal(await count(),n);
    });
  } finally {await mf.dispose();await rm(state,{recursive:true,force:true});}
});
