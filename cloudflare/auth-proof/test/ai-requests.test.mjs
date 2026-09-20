import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

test('D1 reserves bounded paid attempts across concurrent Worker requests', async t => {
  const compiled = await build({ stdin: { contents: `import { reserveAIRequest, settleAIRequest } from './src/ai-requests.ts';
    import { catalogChat } from './src/chat.ts';
    export default { async fetch(r,e) { const x=await r.json();
      if(x.chat) return catalogChat(new Request('https://local.test/api/chat',{method:'POST'}), {...e,OPENAI_API_KEY:'offline-key'}, {ownerId:x.owner}, {message:'palace'});
      if(x.id) {await settleAIRequest(e.DB,x.id,x.owner,x.completed);return Response.json({ok:true});}
      return Response.json({id:await reserveAIRequest(e.DB,x.owner)}); } };`,
    resolveDir: process.cwd(), sourcefile: 'ai-request-fixture.ts' }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  const state = await mkdtemp(join(tmpdir(), 'localley-ai-reservations-'));
  let providerCalls = 0;
  const mf = new Miniflare({ workers: [{ config: { name: 'ai-reservations-fixture', type: 'worker', compatibilityDate: '2026-09-07',
    manifest: { mainModule: 'fixture.mjs', modulesRoot: resolve('test'), modules: { 'fixture.mjs': { type: 'esm', contents: compiled.outputFiles[0].text } } },
    env: { DB: { type: 'd1', id: 'ai-reservations-fixture', dev: { remote: false } } } },
    dev: { outboundService: { type: 'fetcher', handler: () => { providerCalls++; return new Response('unavailable', {status:503}); } } } }],
    resourcePersistencePath: state, resourceTmpPath: state, telemetry: { enabled: false }, cf: false, logRequests: false, unsafeLocalExplorer: false });
  const call = async body => (await mf.dispatchFetch('https://local.test/',{method:'POST',body:JSON.stringify(body)})).json();
  try {
    const db = await mf.getD1Database('DB');
    await db.exec('CREATE TABLE owners (id TEXT PRIMARY KEY);');
    await db.exec((await readFile('migrations/0010_ai_requests.sql','utf8')).replaceAll('\n',' '));
    for(let i=0;i<7;i++) await db.prepare('INSERT INTO owners VALUES (?)').bind(`owner-${i}`).run();
    await db.exec('CREATE TABLE spots (id TEXT, name TEXT, description TEXT, city TEXT, address TEXT, category TEXT, visible INTEGER);');
    await db.prepare('INSERT INTO spots VALUES (?,?,?,?,?,?,1)').bind('spot','{"en":"Palace"}','{}','Seoul','Street','culture').run();
    await t.test('provider failure retains a charged unknown reservation', async () => {
      const reply = await call({chat:true,owner:'owner-0'});
      assert.equal(reply.aiStatus,'unavailable'); assert.equal(reply.model,'catalog'); assert.equal(providerCalls,1);
      assert.equal((await db.prepare('SELECT state FROM native_ai_requests').first()).state,'unknown');
    });
    await t.test('per-owner cap is atomic across concurrent isolates', async () => {
      const results = await Promise.all(Array.from({length:30},()=>call({owner:'owner-0'})));
      assert.equal(results.filter(r=>r.id).length,19);
      const reply = await call({chat:true,owner:'owner-0'});
      assert.equal(reply.aiStatus,'daily_limit'); assert.equal(providerCalls,1);
    });
    await t.test('foreign settlement cannot change a reserved attempt', async () => {
      const {id} = await call({owner:'owner-1'});
      await call({id,owner:'owner-2',completed:true});
      assert.equal((await db.prepare('SELECT state FROM native_ai_requests WHERE id=?').bind(id).first()).state,'reserved');
      await call({id,owner:'owner-1',completed:true});
      assert.equal((await db.prepare('SELECT state FROM native_ai_requests WHERE id=?').bind(id).first()).state,'completed');
    });
    await t.test('global cap retains completed and uncertain attempts', async () => {
      await Promise.all(Array.from({length:130},(_,i)=>call({owner:`owner-${1+i%6}`})));
      assert.equal((await db.prepare('SELECT count(*) AS n FROM native_ai_requests').first()).n,100);
      assert.equal((await call({owner:'owner-6'})).id,null);
    });
    await t.test('prior UTC days do not consume today slots', async () => {
      await db.exec("UPDATE native_ai_requests SET day='2000-01-01';");
      assert.ok((await call({owner:'owner-0'})).id);
    });
    await t.test('accounting failure prevents provider calls', async () => {
      await db.exec('DROP TABLE native_ai_requests;');
      const before = providerCalls;
      const reply = await call({chat:true,owner:'owner-0'});
      assert.equal(reply.aiStatus,'accounting_unavailable'); assert.equal(reply.model,'catalog'); assert.equal(providerCalls,before);
    });
  } finally { await mf.dispose(); await rm(state,{recursive:true,force:true}); }
});
