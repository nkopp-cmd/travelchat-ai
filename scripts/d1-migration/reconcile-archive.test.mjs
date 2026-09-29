import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARCHIVED, IMPORTED, reconcileArchive } from './reconcile-archive.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJSON = (path, value) => writeFile(path, JSON.stringify(value));

test('fails closed on altered source pages and missing R2 references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'localley-reconcile-'));
  const source = join(root, 'source'), media = join(root, 'media');
  try {
    await mkdir(source);
    await mkdir(media);
    await mkdir(join(media, 'objects'));
    const schema = '{}';
    await writeFile(join(source, 'schema.json'), schema);
    const tables = [];
    // A complete classified inventory is required, including all archived-only tables.
    const names = [...IMPORTED, ...ARCHIVED];
    for (const name of names) {
      const bytes = Buffer.from(JSON.stringify([{ id: name }]));
      await writeFile(join(source, `${name}-0.json`), bytes);
      tables.push({ name, primaryKey: ['id'], count: 1, pages: [{ file: `${name}-0.json`, rows: 1, sha256: sha(bytes) }] });
    }
    const manifest = { version: 1, complete: true, source: 'https://llehrhqeolfprutcaopi.supabase.co', schemaSha256: sha(schema), tables };
    await writeJSON(join(source, 'manifest.json'), manifest);
    const bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const hash = sha(bytes), key = `legacy/${hash}.png`;
    await writeFile(join(media, 'objects', `${hash}.png`), bytes);
    const mediaManifest = { version: 1, complete: true, kind: 'legacy_story_media', bucket: 'localley-legacy-media', jurisdiction: 'eu',
      unresolved: [], objects: [{ sha256: hash, key, file: `objects/${hash}.png`, bytes: bytes.length, contentType: 'image/png' }], references: [{ key }] };
    await writeJSON(join(media, 'manifest.json'), mediaManifest);
    await writeJSON(join(media, 'r2-receipt.json'), { bucket: mediaManifest.bucket, jurisdiction: 'eu', verified: [hash] });
    await writeJSON(join(media, 'r2-reconciliation.json'), { totalVerified: 1 });
    assert.equal((await reconcileArchive(source, media)).sourceTables, 48);

    await writeFile(join(source, 'users-0.json'), '[{"id":"changed"}]');
    await assert.rejects(reconcileArchive(source, media), /page_hash_mismatch/);
    await writeFile(join(source, 'users-0.json'), JSON.stringify([{ id: 'users' }]));
    manifest.tables = manifest.tables.filter(table => table.name !== 'affiliate_clicks');
    await writeJSON(join(source, 'manifest.json'), manifest);
    await assert.rejects(reconcileArchive(source, media), /missing_source_table/);
    manifest.tables = tables;
    await writeJSON(join(source, 'manifest.json'), manifest);
    mediaManifest.references.push({ key: 'legacy/missing.png' });
    await writeJSON(join(media, 'manifest.json'), mediaManifest);
    await assert.rejects(reconcileArchive(source, media), /missing_media_reference/);
    mediaManifest.references.pop();
    await writeJSON(join(media, 'manifest.json'), mediaManifest);
    await writeJSON(join(media, 'r2-receipt.json'), { bucket: mediaManifest.bucket, jurisdiction: 'eu', verified: [] });
    await assert.rejects(reconcileArchive(source, media), /historical_remote_receipt_mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
