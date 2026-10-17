/** Counts only. A missing/failed response is not evidence of zero anonymous rows. */
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const project = 'llehrhqeolfprutcaopi';
const origin = `https://${project}.supabase.co`;
export const anonymousCatalogSql = `SELECT c.relname AS name,c.relkind AS kind,c.relrowsecurity AS rls
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f')
 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_class'::regclass
 AND d.objid=c.oid AND d.deptype='e') ORDER BY c.relname`;

export function anonymousKey(key) {
  try {
    if (typeof key !== 'string' || key.length > 16384) return false;
    const parts = key.split('.');
    if (parts.length !== 3 || parts.some(x => !/^[A-Za-z0-9_-]+$/.test(x))) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'anon' && payload.ref === project;
  } catch { return false; }
}

async function catalogResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('catalog_body_missing');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 131072) throw Error('catalog_body_too_large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function checkAnonymousReads({ anonKey, accessToken }, request = fetch) {
  if (!anonymousKey(anonKey) || typeof accessToken !== 'string' || !accessToken.trim()) throw Error('invalid_credentials');
  const options = { redirect: 'error', signal: AbortSignal.timeout(15000) };
  const catalog = await request(`https://api.supabase.com/v1/projects/${project}/database/query/read-only`, {
    ...options, method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: anonymousCatalogSql }),
  });
  if (!catalog.ok) { await catalog.body?.cancel(); throw Error('catalog_unavailable'); }
  const tables = await catalogResponse(catalog);
  if (!Array.isArray(tables) || tables.length < 1 || tables.length > 200
    || tables.some(t => !/^[a-z][a-z0-9_]{0,62}$/.test(t.name) || !['r','p','v','m','f'].includes(t.kind)
      || typeof t.rls !== 'boolean') || new Set(tables.map(t => t.name)).size !== tables.length) throw Error('invalid_catalog');
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
  // A successful key-authenticated control prevents a revoked/bad key from making all tables appear protected.
  const control = await request(`${origin}/auth/v1/settings`, { ...options, method: 'GET', headers });
  await control.body?.cancel();
  if (control.status !== 200) throw Error('anonymous_key_control_unavailable');
  const results = [];
  for (const table of tables) {
    const row = { table: table.name, relationKind: table.kind, rls: table.rls, status: null, count: null, state: 'unknown' };
    try {
      const response = await request(`${origin}/rest/v1/${table.name}?select=*&limit=0`, {
        redirect: 'error', signal: AbortSignal.timeout(10000), method: 'HEAD', headers: { ...headers, Prefer: 'count=exact' },
      });
      row.status = response.status;
      await response.body?.cancel();
      if ([401,403].includes(response.status)) row.state = 'access_denied';
      else if ([200,206].includes(response.status)) {
        const match = /^\*\/(0|[1-9][0-9]*)$/.exec(response.headers.get('content-range') ?? '');
        const count = match ? Number(match[1]) : NaN;
        if (Number.isSafeInteger(count)) { row.count = count; row.state = count === 0 ? 'zero_rows' : 'exposed_rows'; }
      }
    } catch { row.state = 'request_failed'; }
    results.push(row);
  }
  return { at: new Date().toISOString(), project, state: results.every(r => ['zero_rows','access_denied'].includes(r.state)) ? 'passed' : 'failed',
    relationCount: tables.length, results, publicExceptions: [], rowsRetrieved: 0,
    limits: ['A zero count proves current visibility only; seeded policy tests are required for empty tables.',
      'Permission denial is recorded separately from an exact zero count.',
      'No policy, row, secret, mail, provider or Worker change occurred.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (async () => {
    if (process.argv.length !== 4 || process.argv[2] !== '--out') throw Error('usage');
    const output = resolve(process.argv[3]);
    if (!output.startsWith('/home/dev/.local/state/localley/')) throw Error('private_output_required');
    const local = parseEnv(await readFile('/home/dev/projects/CyberLink/apps/Localley/.env.local', 'utf8'));
    const shared = parseEnv(await readFile('/home/dev/secrets/keys.env', 'utf8'));
    const report = await checkAnonymousReads({ anonKey: local.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      accessToken: local.SUPABASE_ACCESS_TOKEN || shared.SUPABASE_ACCESS_TOKEN });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ state: report.state, relations: report.relationCount, rowsRetrieved: 0,
      exposed: report.results.filter(r => r.state === 'exposed_rows').map(r => r.table), unknown: report.results.filter(r => ['unknown','request_failed'].includes(r.state)).map(r => r.table) }));
    if (report.state !== 'passed') process.exitCode = 1;
  })().catch(() => { console.error('Anonymous regression incomplete; no row values or credentials recorded.'); process.exitCode = 1; });
}
