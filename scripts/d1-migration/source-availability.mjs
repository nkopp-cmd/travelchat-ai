/** Read-only Data API inventory. Neither an empty result nor a missing API proves physical absence. */
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inventoryCheckout } from './runtime-inventory.mjs';
const PROJECT = 'https://llehrhqeolfprutcaopi.supabase.co';

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 65536) throw Error('response_too_large');
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch { return null; } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function sourceAvailability(table, credentials, request = fetch) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(table) || credentials.sourceUrl !== PROJECT
    || typeof credentials.sourceKey !== 'string' || !credentials.sourceKey) throw Error('invalid_source_inventory_input');
  const result = { table, state: 'unavailable', status: null, count: null, physicalState: 'not_audited' };
  let response;
  try {
    response = await request(`${PROJECT}/rest/v1/${table}?select=*&limit=0`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: credentials.sourceKey, Authorization: `Bearer ${credentials.sourceKey}`, Prefer: 'count=exact' },
    });
  } catch { return { ...result, state: 'request_failed' }; }
  result.status = response.status;
  const body = await boundedJson(response);
  if ([401, 403].includes(response.status)) return { ...result, state: 'access_denied' };
  if (!response.ok) {
    return response.status === 404 && body?.code === 'PGRST205'
      ? { ...result, state: 'unavailable_in_data_api', code: 'PGRST205' } : result;
  }
  const match = /^\*\/(0|[1-9][0-9]*)$/.exec(response.headers.get('content-range') || '');
  const count = match ? Number(match[1]) : NaN;
  if (!Array.isArray(body) || body.length !== 0 || !Number.isSafeInteger(count) || count < 0) {
    return { ...result, state: 'invalid_count_response' };
  }
  return { ...result, state: 'available', count };
}

export async function sourceAvailabilityInventory(inventory, credentials, request = fetch) {
  const names = Object.keys(inventory.resources).filter(name => name.startsWith('table:'))
    .map(name => name.slice(6)).sort();
  if (!names.includes('spots') || names.length > 100 || names.some(name => !/^[a-z][a-z0-9_]{0,62}$/.test(name))) {
    throw Error('invalid_source_resource_inventory');
  }
  const control = await sourceAvailability('spots', credentials, request);
  if (control.state !== 'available' || control.count < 1) throw Error('source_control_unavailable');
  const results = [control];
  const rest = names.filter(name => name !== 'spots');
  for (let offset = 0; offset < rest.length; offset += 4) {
    results.push(...await Promise.all(rest.slice(offset, offset + 4).map(name => sourceAvailability(name, credentials, request))));
  }
  results.sort((a, b) => a.table.localeCompare(b.table));
  return { checkedAt: new Date().toISOString(), readOnly: true, cutoverReady: false,
    sourceDigest: inventory.sourceDigest, checkoutPolicy: inventory.checkoutPolicy,
    staticResources: names.length, tables: results,
    summary: Object.fromEntries(['available','unavailable','unavailable_in_data_api','request_failed','access_denied','invalid_count_response']
      .map(state => [state, results.filter(row => row.state === state).length])),
    limits: ['Data API counts do not prove physical relation types, triggers, external writers or complete history.',
      'Static references do not prove current callers; classify each resource with runtime evidence.',
      'No row values, RPC executions, storage changes, source writes or cutover occurred.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--out') throw Error('usage: source-availability.mjs --out NEW_PRIVATE_REPORT');
    const root = resolve(dirname(new URL(import.meta.url).pathname), '../..');
    const env = parseEnv(await readFile('/home/dev/projects/CyberLink/apps/Localley/.env.local', 'utf8'));
    const inventory = await inventoryCheckout(root);
    const report = await sourceAvailabilityInventory(inventory, {
      sourceUrl: env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ''), sourceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });
    await writeFile(resolve(args[1]), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ readOnly: true, staticResources: report.staticResources, summary: report.summary, cutoverReady: false }));
  })().catch(() => { console.error('Source availability report incomplete; no source writes occurred.'); process.exitCode = 1; });
}
