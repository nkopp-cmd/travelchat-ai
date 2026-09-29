// Read-only, byte-for-byte remote verification of an existing private EU R2 archive.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const ACCOUNT = '664f242340bcec2f32daaeee15f58bde';

export async function verifyR2(directory, token, request = fetch) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json')));
  if (!token || manifest.version !== 1 || manifest.complete !== true || manifest.kind !== 'legacy_story_media' ||
    manifest.bucket !== 'localley-legacy-media' || manifest.jurisdiction !== 'eu' || !Array.isArray(manifest.objects) ||
    !Array.isArray(manifest.unresolved) || manifest.unresolved.length) throw new Error('invalid_r2_manifest');
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${manifest.bucket}`;
  const headers = { Authorization: `Bearer ${token}`, 'cf-r2-jurisdiction': 'eu' };
  const get = path => request(`${base}/${path}`, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  for (const kind of ['managed', 'custom']) {
    const response = await get(`domains/${kind}`);
    if (!response.ok) throw new Error('bucket_privacy_unavailable');
    const body = await response.json();
    if (body.success !== true || (kind === 'managed' ? body.result?.enabled !== false : body.result?.domains?.length !== 0)) throw new Error('bucket_not_private');
  }
  const seen = new Set();
  let verified = 0, bytesVerified = 0;
  for (const object of manifest.objects) {
    if (!/^[a-f0-9]{64}$/.test(object.sha256) || !['image/png', 'image/jpeg'].includes(object.contentType) ||
      object.key !== `legacy/${object.sha256}.${object.contentType === 'image/png' ? 'png' : 'jpg'}` || seen.has(object.key) ||
      !Number.isSafeInteger(object.bytes) || object.bytes <= 0 || object.bytes > 20 * 1024 * 1024) throw new Error('invalid_r2_object');
    seen.add(object.key);
    const response = await get(`objects/${object.key}`);
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('remote_object_unavailable'); }
    const reader = response.body.getReader(), hash = createHash('sha256');
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > object.bytes) throw new Error('remote_object_too_large');
        hash.update(chunk.value);
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (bytes !== object.bytes || hash.digest('hex') !== object.sha256) throw new Error('remote_object_hash_mismatch');
    verified++; bytesVerified += bytes;
  }
  if (verified !== manifest.objects.length || !Array.isArray(manifest.references) || manifest.references.some(reference => !seen.has(reference.key))) throw new Error('missing_r2_reference');
  return { asOf: new Date().toISOString(), bucket: manifest.bucket, jurisdiction: manifest.jurisdiction, private: true,
    remoteObjectsVerified: verified, bytesVerified, references: manifest.references.length, readOnly: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--media' || args[2] !== '--out') throw new Error('usage: verify-r2.mjs --media PRIVATE_MEDIA_DIR --out NEW_PRIVATE_REPORT');
  (async () => {
    const token = parseEnv(await readFile(join(homedir(), 'secrets/keys.env'), 'utf8')).CLOUDFLARE_API_TOKEN;
    const result = await verifyR2(resolve(args[1]), token);
    await writeFile(resolve(args[3]), JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify(result));
  })().catch(() => { console.error('Remote R2 verification incomplete; no remote writes occurred.'); process.exitCode = 1; });
}
