// Read-only comparison of an exact source snapshot and the current Better Auth D1 IDs.
// No email matching, identity claims, user creation, imports, or writes.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const sha = value => createHash('sha256').update(value).digest('hex');
const SOURCE = 'https://llehrhqeolfprutcaopi.supabase.co';
const ACCOUNT = '664f242340bcec2f32daaeee15f58bde';
const AUTH_DB = '73378d0e-7f2a-465a-8188-a67cb6d2a5c2';
export const ADMIN_IDS = ['user_38VRkLQbwVNbAqR9lBXTMGXr54h', 'eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx'];
const TABLES = ['users', 'itineraries', 'conversations', 'subscriptions', 'usage_tracking'];

export function classifyOwners(tables, authIds) {
  if (!Array.isArray(authIds) || authIds.some(id => typeof id !== 'string' || !id) || new Set(authIds).size !== authIds.length) throw new Error('invalid_auth_ids');
  const profiles = new Map();
  for (const row of tables.users) {
    if (!row || typeof row.id !== 'string' || typeof row.clerk_id !== 'string' || !row.clerk_id || profiles.has(row.clerk_id)) throw new Error('invalid_source_profile');
    profiles.set(row.clerk_id, row.id);
  }
  const sourceOwners = new Set(profiles.keys());
  const ownerRecords = Object.fromEntries(TABLES.slice(1).map(name => [name, { count: 0, unclaimed: 0 }]));
  for (const name of TABLES.slice(1)) {
    const seen = new Set();
    for (const row of tables[name]) {
      const owner = row?.clerk_user_id;
      if (typeof owner !== 'string' || !owner || typeof row?.id !== 'string' || seen.has(row.id)) throw new Error(`invalid_source_record:${name}`);
      seen.add(row.id);
      sourceOwners.add(owner);
      ownerRecords[name].count++;
      if (!authIds.includes(owner)) ownerRecords[name].unclaimed++;
      if (name === 'itineraries' && row.user_id != null && profiles.get(owner) != null && profiles.get(owner) !== row.user_id) throw new Error('conflicting_itinerary_owner');
    }
  }
  const auth = new Set(authIds);
  const unclaimedOwners = [...sourceOwners].filter(id => !auth.has(id)).sort();
  const missingAdmins = ADMIN_IDS.filter(id => !auth.has(id));
  return {
    sourceProfiles: profiles.size, sourceOwners: sourceOwners.size, authUsers: auth.size,
    mappedSourceOwners: [...sourceOwners].filter(id => auth.has(id)).length,
    unclaimedSourceOwners: unclaimedOwners.length,
    sourceProfilesAbsentAuth: [...profiles.keys()].filter(id => !auth.has(id)).length,
    authUsersWithoutSourceProfile: [...auth].filter(id => !profiles.has(id)).length,
    missingAdminIds: missingAdmins,
    ownerRecords,
    // Exact IDs stay in the private report. No email-based assignment is ever made.
    private: { unclaimedOwners, authWithoutProfile: [...auth].filter(id => !profiles.has(id)).sort() },
  };
}

export async function snapshotOwners(directory) {
  const raw = await readFile(join(directory, 'manifest.json'));
  const manifest = JSON.parse(raw.toString('utf8'));
  if (manifest.version !== 1 || manifest.complete !== true || manifest.source !== SOURCE || !Array.isArray(manifest.tables)) throw new Error('incomplete_source_snapshot');
  const schema = await readFile(join(directory, 'schema.json'));
  if (sha(schema) !== manifest.schemaSha256) throw new Error('source_schema_mismatch');
  const tables = {};
  for (const name of TABLES) {
    const entry = manifest.tables.find(t => t.name === name);
    if (!entry || !Array.isArray(entry.pages) || entry.pages.length < 1 || !Number.isSafeInteger(entry.count)) throw new Error(`missing_source_table:${name}`);
    const rows = [];
    const seen = new Set();
    for (const [index, page] of entry.pages.entries()) {
      if (page.file !== `${name}-${index}.json` || !Number.isSafeInteger(page.rows)) throw new Error('unexpected_snapshot_page');
      const bytes = await readFile(join(directory, page.file));
      if (sha(bytes) !== page.sha256) throw new Error(`source_page_mismatch:${name}`);
      const parsed = JSON.parse(bytes.toString('utf8'));
      if (!Array.isArray(parsed) || parsed.length !== page.rows) throw new Error(`source_count_mismatch:${name}`);
      for (const row of parsed) {
        const keys = (entry.primaryKey ?? []).map(key => row[key]);
        const id = JSON.stringify(keys);
        if (!keys.length || keys.some(value => value == null) || seen.has(id)) throw new Error(`source_primary_key_mismatch:${name}`);
        seen.add(id);
      }
      rows.push(...parsed);
    }
    if (rows.length !== entry.count) throw new Error(`source_count_mismatch:${name}`);
    tables[name] = rows;
  }
  const started = Date.parse(manifest.startedAt);
  if (!Number.isFinite(started) || started > Date.now() + 60000) throw new Error('invalid_snapshot_time');
  return { tables, manifestSha256: sha(raw), startedAt: manifest.startedAt, oldSnapshot: Date.now() - started > 24 * 3600 * 1000 };
}

export async function fetchAuthIds(token, request = fetch) {
  if (!token) throw new Error('missing_cloudflare_token');
  const response = await request(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${AUTH_DB}/query`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: 'SELECT id FROM "user" ORDER BY id LIMIT 10001' }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`auth_query_http_${response.status}`); }
  const result = await response.json();
  if (result.success !== true || result.result?.length !== 1 || !Array.isArray(result.result[0].results) || result.result[0].results.length > 10000) throw new Error('auth_query_unavailable');
  return result.result[0].results.map(row => row.id);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--snapshot' || args[2] !== '--out') throw new Error('usage: owner-rehearsal.mjs --snapshot PRIVATE_SNAPSHOT --out NEW_PRIVATE_REPORT');
  const snapshot = await snapshotOwners(resolve(args[1]));
  const token = parseEnv(await readFile(join(homedir(), 'secrets/keys.env'), 'utf8')).CLOUDFLARE_API_TOKEN;
  const report = { asOf: new Date().toISOString(), sourceSnapshotAt: snapshot.startedAt, sourceManifestSha256: snapshot.manifestSha256,
    oldSnapshot: snapshot.oldSnapshot, ...classifyOwners(snapshot.tables, await fetchAuthIds(token)) };
  // Never overwrite evidence; keep IDs in the private report, not the command output.
  await writeFile(resolve(args[3]), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const { private: _private, ...summary } = report;
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Owner reconciliation incomplete. No identity or data writes occurred.'); process.exitCode = 1; });
}
