/** Read-only source availability and candidate schema inventory; never approves a cutover. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const PROJECT = 'https://llehrhqeolfprutcaopi.supabase.co';
const ACCOUNT = '664f242340bcec2f32daaeee15f58bde';
const DATABASE = '6f5b1df7-2eb5-479f-8803-8095e72c7053';
const SOURCE_TABLES = ['notifications', 'notification_preferences', 'push_subscriptions'];
const CANDIDATE_TABLES = ['preview_notifications', 'preview_notification_preferences'];
const HISTORY_TABLES = ['legacy_notifications', 'legacy_notification_preferences', 'legacy_push_subscriptions'];
const safeCount = n => Number.isSafeInteger(n) && n >= 0;

async function boundedJson(response) {
  if (!response.body) throw Error('invalid_response');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 65536) throw Error('response_too_large');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function sourceTable(table, credentials, request = fetch) {
  if (!['spots', ...SOURCE_TABLES].includes(table)) throw Error('invalid_source_table');
  const url = new URL(credentials.sourceUrl);
  if (url.origin !== PROJECT || url.pathname !== '/' || url.search || url.hash || url.username || url.password
    || !credentials.sourceKey) throw Error('invalid_source_credentials');
  const response = await request(`${PROJECT}/rest/v1/${table}?select=*&limit=0`, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { apikey: credentials.sourceKey, Authorization: `Bearer ${credentials.sourceKey}`, Prefer: 'count=exact' },
  });
  let body; try { body = await boundedJson(response); } catch { body = null; }
  const result = { table, status: response.status, state: 'unavailable', count: null,
    physicalTableState: 'not_audited', ownerCoverage: 'unknown' };
  if ([401, 403].includes(response.status)) return { ...result, state: 'access_denied' };
  if (!response.ok) {
    if (response.status === 404 && body?.code === 'PGRST205') return { ...result, state: 'unavailable_in_data_api', code: 'PGRST205' };
    return result;
  }
  const range = response.headers.get('content-range');
  const match = /^\*\/(0|[1-9][0-9]*)$/.exec(range || '');
  const count = match ? Number(match[1]) : NaN;
  if (!Array.isArray(body) || body.length !== 0 || !safeCount(count)) return { ...result, state: 'invalid_count_response' };
  return { ...result, state: 'available', count };
}

export async function notificationInventory(credentials, request = fetch) {
  if (!credentials.cloudflareToken) throw Error('missing_candidate_credentials');
  const control = await sourceTable('spots', credentials, request);
  if (control.state !== 'available' || control.count < 1) throw Error('source_control_unavailable');
  const source = [];
  for (const table of SOURCE_TABLES) source.push(await sourceTable(table, credentials, request));
  const query = async sql => {
    const response = await request(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${credentials.cloudflareToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params: [] }),
    });
    const body = await boundedJson(response);
    if (!response.ok || body.success !== true || body.result?.length !== 1
      || body.result[0].success !== true || !Array.isArray(body.result[0].results)) throw Error('candidate_inventory_unavailable');
    return body.result[0].results;
  };
  const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('preview_notifications','preview_notification_preferences','legacy_notifications','legacy_notification_preferences','legacy_push_subscriptions') ORDER BY name");
  if (tables.some(row => ![...CANDIDATE_TABLES, ...HISTORY_TABLES].includes(row.name))
    || new Set(tables.map(row => row.name)).size !== tables.length) throw Error('invalid_candidate_tables');
  const candidate = [];
  for (const table of CANDIDATE_TABLES) {
    if (!tables.some(row => row.name === table)) throw Error('candidate_table_unavailable');
    const counts = await query(`SELECT COUNT(*) AS n FROM ${table}`);
    if (counts.length !== 1 || !safeCount(counts[0].n)) throw Error('invalid_candidate_count');
    const schema = await query(`PRAGMA table_info(${table})`);
    if (!schema.length || schema.some(row => !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(row.name)
      || !['TEXT','INTEGER','REAL','BLOB','NUMERIC'].includes(row.type))) throw Error('invalid_candidate_schema');
    candidate.push({ table, count: counts[0].n, scope: 'isolated_preview_only',
      columns: schema.map(row => ({ name: row.name, type: row.type })) });
  }
  const owners = await query('SELECT source,COUNT(*) AS n FROM owners GROUP BY source ORDER BY source');
  if (owners.some(row => !['new','legacy-fixture'].includes(row.source) || !safeCount(row.n))) throw Error('invalid_owner_counts');
  const legacy = await query('SELECT COUNT(*) AS total,SUM(clerkUserId IS NULL) AS unclaimed FROM legacy_owners');
  if (legacy.length !== 1 || !safeCount(legacy[0].total)
    || !(safeCount(legacy[0].unclaimed) || (legacy[0].total === 0 && legacy[0].unclaimed === null))
    || legacy[0].unclaimed > legacy[0].total) throw Error('invalid_legacy_owner_counts');
  return { checkedAt: new Date().toISOString(), readOnly: true, control, source, candidate,
    ownerClasses: owners.map(row => ({ source: row.source, count: row.n })), legacyOwners: legacy[0],
    historicalTablesPresent: tables.filter(row => HISTORY_TABLES.includes(row.name)).map(row => row.name),
    historicalParity: 'unproven', cutoverReady: false,
    limits: ['Data API unavailability is not physical table absence or zero history.',
      'Count/schema inventory is not an owner/row-value parity export.',
      'Preview fixtures/defaults do not establish historical consent or delivery eligibility.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--out') throw Error('invalid_arguments');
    const app = '/home/dev/projects/CyberLink/apps/Localley';
    const env = parseEnv(await readFile(join(app, '.env.local'), 'utf8'));
    const keys = parseEnv(await readFile(join(homedir(), 'secrets/keys.env'), 'utf8'));
    const result = await notificationInventory({ sourceUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      sourceKey: env.SUPABASE_SERVICE_ROLE_KEY, cloudflareToken: keys.CLOUDFLARE_API_TOKEN });
    await writeFile(resolve(args[1]), JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ readOnly: true, source: result.source.map(({ table, state, count }) => ({ table, state, count })),
      candidate: result.candidate.map(({ table, count }) => ({ table, count })), historicalParity: result.historicalParity, cutoverReady: false }));
  })().catch(() => { console.error('Notification inventory incomplete; no source or candidate writes occurred.'); process.exitCode = 1; });
}
