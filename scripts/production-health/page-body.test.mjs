import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkPageBody } from './page-body.mjs';

test('drains every chunk to completion without canceling a successful response or exposing content', async () => {
  let next = 0, canceled = false, ended = false;
  const parts = ['PRIVATE', '한글', 'HTML'];
  const body = new ReadableStream({
    pull(controller) {
      if (next < parts.length) controller.enqueue(new TextEncoder().encode(parts[next++]));
      else { ended = true; controller.close(); }
    }, cancel() { canceled = true; },
  }, { highWaterMark: 0 });
  const result = await checkPageBody(new Response(body));
  assert.deepEqual(result, { usable: true, reason: 'page_body_complete', bytes: Buffer.byteLength(parts.join('')) });
  assert.equal(ended, true); assert.equal(canceled, false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|HTML|한글/);
});
test('missing and empty HTTP200 bodies are unhealthy', async () => {
  assert.deepEqual(await checkPageBody(new Response(null)), { usable: false, reason: 'page_body_missing', bytes: 0 });
  assert.deepEqual(await checkPageBody(new Response('')), { usable: false, reason: 'page_body_empty', bytes: 0 });
});
test('oversized bodies stop at the bound and cancel the unread stream', async () => {
  let reads = 0, canceled = false;
  const body = new ReadableStream({ pull(c) { reads++; c.enqueue(new Uint8Array(65536)); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
  assert.deepEqual(await checkPageBody(new Response(body)), { usable: false, reason: 'page_body_too_large', bytes: 2097153 });
  assert.equal(reads, 33); assert.equal(canceled, true);
});
test('partial stream failures retain a fixed reason and no upstream error text', async () => {
  let reads = 0;
  const body = new ReadableStream({ pull(c) { if (reads++ === 0) c.enqueue(new Uint8Array(3)); else c.error(Error('PRIVATE_TOKEN_AND_PAYLOAD')); } }, { highWaterMark: 0 });
  const result = await checkPageBody(new Response(body));
  assert.deepEqual(result, { usable: false, reason: 'page_body_failed_or_timed_out', bytes: 3 });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('real HTTP200 with a truncated body is unhealthy after headers succeed', async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { 'content-length': '9999' }); response.flushHeaders(); response.write('partial');
    setTimeout(() => response.destroy(), 100);
  }, async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    const result = await checkPageBody(response);
    assert.equal(result.usable, false); assert.equal(result.reason, 'page_body_failed_or_timed_out');
  });
});
test('the actual fetch deadline remains active while draining a stalled HTTP200 body', async () => {
  await withServer((_request, response) => {
    response.writeHead(200); response.flushHeaders(); response.write('partial');
  }, async url => {
    const signal = AbortSignal.timeout(500);
    const response = await fetch(url, { signal }); assert.equal(response.status, 200);
    const result = await checkPageBody(response);
    assert.equal(signal.aborted, true); assert.equal(result.usable, false);
    assert.equal(result.reason, 'page_body_failed_or_timed_out');
  });
});
test('actual CLI refuses broken HTTP200 pages, retains status, and preserves independent log totals', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'localley-page-body-'));
  try {
    const preload = `globalThis.fetch=async url=>{
      if(String(url).endsWith('/script-settings'))return new Response(JSON.stringify({success:true,result:{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,head_sampling_rate:1,invocation_logs:true,persist:true}}}}));
      if(String(url).includes('/telemetry/query'))return new Response(JSON.stringify({success:true,result:{run:{status:'COMPLETED'},statistics:{abr_level:1},events:{count:0,events:[]}}}));
      if(String(url).includes('/api/cities?'))return new Response(JSON.stringify({success:true,total:1,cities:[{slug:'seoul',spotCount:1,status:'beta'}]}));
      if(String(url)==='https://www.localley.io/') {let n=0;return new Response(new ReadableStream({pull(c){if(n++===0)c.enqueue(new TextEncoder().encode('PRIVATE_HTML'));else c.error(Error('PRIVATE_PROVIDER_SECRET'));}},{highWaterMark:0}));}
      return new Response('ok');};`;
    const path = join(directory, 'report.json');
    const run = spawnSync(process.execPath, ['--import', 'data:text/javascript;base64,' + Buffer.from(preload).toString('base64'), 'scripts/check-production-health.mjs', '--report', path], { env: { ...process.env, CLOUDFLARE_API_TOKEN: 'fixture-token' }, encoding: 'utf8' });
    assert.equal(run.status, 1, run.stderr);
    const report = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(report.health.map(x => x.status), [200, 200, 200]);
    assert.equal(report.health[0].pageBody.usable, false);
    assert.equal(report.health[1].pageBody.usable, true);
    assert.equal(report.health[2].catalog.usable, true);
    assert.equal(report.logs.available, true); assert.equal(report.logs.observedEvents, 0);
    assert.deepEqual(report.logs.top5, []);
    assert.doesNotMatch(JSON.stringify(report) + run.stdout + run.stderr, /PRIVATE_HTML|PRIVATE_PROVIDER_SECRET|fixture-token/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
