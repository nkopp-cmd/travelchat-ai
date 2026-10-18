import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { exchangeRscBody } from './rsc-body-transport.mjs';
async function server(handler, work) {
  const s = http.createServer(handler);
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  try { await work(new URL('http://127.0.0.1:' + s.address().port + '/')); }
  finally { s.closeAllConnections(); await new Promise(r => s.close(r)); }
}
test('body phase comparison observes real server close before deferred final chunk', async () => {
  let interrupted = false;
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  try {
    await server((q, r) => {
      r.writeHead(200, { 'Content-Type': 'text/x-component' });
      r.write('0:{"private":"PRIVATE_BODY"}\n');
      const t = setTimeout(() => r.end('1:{}\n'), 80);
      r.on('close', () => { if (!r.writableFinished) interrupted = true; clearTimeout(t); });
    }, async url => {
      const complete = await exchangeRscBody(url, { agent });
      assert.equal(complete.status, 200);
      assert.equal(complete.complete, true);
      assert.equal(complete.contentTypeRsc, true);
      const partial = await exchangeRscBody(url, { agent, disconnectAfterFirstChunk: true });
      assert.equal(partial.status, 200);
      assert.equal(partial.headersBeforeDisconnect, true);
      assert.equal(partial.disconnectRequested, true);
      assert.equal(partial.parserCompleteAtDisconnect, false);
      assert.equal(partial.complete, false);
      assert.equal(partial.reusedSocket, true);
      assert.ok(partial.bytes > 0 && partial.bytes < complete.bytes);
      await new Promise(r => setTimeout(r, 20));
      assert.equal(interrupted, true);
      assert.doesNotMatch(JSON.stringify([complete, partial]), /PRIVATE_BODY/);
    });
  } finally { agent.destroy(); }
});
test('fully parsed body cannot count as a proven partial HTTP message', async () => {
  await server((q, r) => r.end('done'), async url => {
    const row = await exchangeRscBody(url, { disconnectAfterFirstChunk: true });
    assert.equal(row.parserCompleteAtDisconnect, true);
  });
});
test('unexpected origin body abort stays an error', async () => {
  await server((q, r) => { r.write('partial'); setTimeout(() => r.destroy(), 15); }, async url => {
    await assert.rejects(exchangeRscBody(url), /unexpected_body_/);
  });
});
test('body deadline and byte bounds stop stalled or oversized responses', async () => {
  await server((q, r) => r.write('partial'), async url => {
    await assert.rejects(exchangeRscBody(url, { deadlineMs: 30 }), /deadline/);
  });
  await server((q, r) => r.end('oversized'), async url => {
    await assert.rejects(exchangeRscBody(url, { maxBytes: 3 }), /response_bound/);
  });
});
test('RSC error frame split across chunks remains visible without body retention', async () => {
  await server((q, r) => { r.write('0:{}\na:E'); setTimeout(() => r.end('{"digest":"PRIVATE_BODY"}\n'), 10); }, async url => {
    const row = await exchangeRscBody(url);
    assert.equal(row.errorFrames, true);
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE_BODY/);
  });
});
test('redirect value stays private and callback errors are bounded', async () => {
  await server((q, r) => { r.writeHead(307, { Location: '/?private=PRIVATE_BODY' }); r.end(); }, async url => {
    let location;
    const row = await exchangeRscBody(url, { onRedirect: x => { location = x; } });
    assert.equal(location, '/?private=PRIVATE_BODY');
    assert.doesNotMatch(JSON.stringify(row), /PRIVATE_BODY/);
    await assert.rejects(exchangeRscBody(url, { onRedirect: () => { throw Error('PRIVATE_BODY'); } }), /^Error: redirect_callback$/);
  });
});
test('reject invalid bounds without starting transport', async () => {
  for (const options of [{ maxBytes: 0 }, { maxBytes: 2097153 }, { deadlineMs: 0 }, { deadlineMs: 25001 }]) {
    await assert.rejects(exchangeRscBody(new URL('http://127.0.0.1:1'), options), /invalid_transport_options/);
  }
});
