// Generate candidate SQL from verified private snapshot pages. Never prints profile emails.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const quote = value => value === null ? 'NULL' : "'" + value.replaceAll("'", "''") + "'";

export function profileEmailSql(rows) {
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('Invalid profile rows');
  const profiles = new Set(), owners = new Set();
  const sql = rows.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(row.id)
      || typeof row.clerk_id !== 'string' || !/^user_[A-Za-z0-9]{1,95}$/.test(row.clerk_id)
      || !(row.email === null || typeof row.email === 'string' && row.email.length <= 320 && !/[\x00-\x1f\x7f]/.test(row.email))
      || profiles.has(row.id) || owners.has(row.clerk_id)) throw new Error('Invalid or duplicate profile source');
    profiles.add(row.id); owners.add(row.clerk_id);
    return `INSERT INTO legacy_profile_emails(profileId,email) SELECT id,${quote(row.email)} FROM profiles WHERE id=${quote(row.id)} AND ownerId=${quote(row.clerk_id)} ON CONFLICT(profileId) DO UPDATE SET email=excluded.email WHERE legacy_profile_emails.email IS NOT excluded.email;`;
  }).join('\n') + '\n';
  return { sql, profiles: rows.length, sqlSha256: digest(sql) };
}

export async function prepareProfileEmailImport(snapshotDir) {
  const manifestBytes = await readFile(join(snapshotDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const tables = manifest.tables?.filter(table => table.name === 'users');
  if (manifest.version !== 1 || manifest.complete !== true
    || manifest.source !== 'https://llehrhqeolfprutcaopi.supabase.co' || tables?.length !== 1
    || !Number.isSafeInteger(tables[0].count) || tables[0].count < 0
    || !Array.isArray(tables[0].pages) || !tables[0].pages.length) throw new Error('Invalid users manifest');
  const rows = [];
  for (const [index, page] of tables[0].pages.entries()) {
    if (page.file !== `users-${index}.json`) throw new Error('Invalid users page');
    const bytes = await readFile(join(snapshotDir, page.file));
    if (digest(bytes) !== page.sha256) throw new Error('Users page hash mismatch');
    const parsed = JSON.parse(bytes);
    if (!Array.isArray(parsed) || parsed.length !== page.rows) throw new Error('Users page count mismatch');
    rows.push(...parsed);
  }
  if (rows.length !== tables[0].count) throw new Error('Users count mismatch');
  return { ...profileEmailSql(rows), sourceManifestSha256: digest(manifestBytes) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [snapshotDir, output] = process.argv.slice(2);
  if (!snapshotDir || !output || process.argv.length !== 4) throw new Error('Usage: profile-emails.mjs <private snapshot dir> <private SQL output>');
  const { sql, ...report } = await prepareProfileEmailImport(resolve(snapshotDir));
  await writeFile(resolve(output), sql, { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(report));
}
