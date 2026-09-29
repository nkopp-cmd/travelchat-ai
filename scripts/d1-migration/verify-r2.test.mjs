import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyR2 } from './verify-r2.mjs';

test('verifies private R2 bytes read-only and rejects silent corruption', async () => {
  const root = await mkdtemp(join(tmpdir(), 'localley-r2-'));
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const key = `legacy/${sha}.png`;
  const manifest = { version: 1, complete: true, kind: 'legacy_story_media', bucket: 'localley-legacy-media', jurisdiction: 'eu', unresolved: [],
    objects: [{ sha256: sha, key, bytes: bytes.length, contentType: 'image/png' }], references: [{ key }] };
  const file = join(root, 'manifest.json');
  const seen = [];
  const request = async (url, init) => {
    seen.push([url, init.method]);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer fixture-only');
    if (url.endsWith('/domains/managed')) return Response.json({ success: true, result: { enabled: false } });
    if (url.endsWith('/domains/custom')) return Response.json({ success: true, result: { domains: [] } });
    return new Response(bytes);
  };
  try {
    await writeFile(file, JSON.stringify(manifest));
    const result = await verifyR2(root, 'fixture-only', request);
    assert.equal(result.remoteObjectsVerified, 1);
    assert.equal(result.references, 1);
    assert.equal(seen.length, 3);
    assert.ok(seen.every(([, method]) => method === undefined));
    await assert.rejects(verifyR2(root, 'fixture-only', async (url, init) => url.endsWith('/objects/' + key)
      ? new Response(Buffer.from('wrong')) : request(url, init)), /remote_object_hash_mismatch/);
    await assert.rejects(verifyR2(root, 'fixture-only', async (url) => url.endsWith('/domains/managed')
      ? Response.json({ success: true, result: { enabled: true } }) : request(url, {})), /bucket_not_private/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
