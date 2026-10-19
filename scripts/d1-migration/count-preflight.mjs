/** Read-only candidate counts. No release helpers, retries or database writes.
 * CLOUDFLARE_API_TOKEN=... node scripts/d1-migration/count-preflight.mjs preflight|audit <new-private-json>
 * Run preflight first, then at most one audit. Counts are observed per-table,
 * not an atomic snapshot, row-value parity, or permission to release.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACCOUNT = '664f242340bcec2f32daaeee15f58bde';
export const DATABASE = '6f5b1df7-2eb5-479f-8803-8095e72c7053';
export const CATALOG = "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name";

export function countSql(table) {
  assert(typeof table === 'string' && /^[A-Za-z_][A-Za-z_0-9]*$/.test(table), 'invalid_table_identifier');
  return `SELECT count(*) AS n FROM "${table}"`;
}

async function count(query, table) {
  const rows = await query(countSql(table));
  assert(Array.isArray(rows) && rows.length === 1 && Number.isSafeInteger(rows[0]?.n) && rows[0].n >= 0,
    'invalid_single_table_count');
  return { table, count: rows[0].n };
}

export async function readCounts(query, mode) {
  assert(['preflight', 'audit'].includes(mode), 'invalid_mode');
  const preflight = [];
  for (const table of ['owners', 'itineraries']) preflight.push(await count(query, table));
  if (mode === 'preflight') return { preflight };
  const catalog = await query(CATALOG);
  assert(Array.isArray(catalog) && catalog.length > 40 && catalog.length <= 64, 'catalog_bound');
  assert(new Set(catalog.map(row => row.name)).size === catalog.length, 'duplicate_catalog_table');
  for (const row of catalog) {
    countSql(row.name);
    assert(typeof row.sql === 'string', 'invalid_schema');
  }
  assert(['owners', 'itineraries'].every(name => catalog.some(row => row.name === name)), 'incomplete_catalog');
  const counts = [];
  for (const row of catalog) counts.push(await count(query, row.name));
  return { preflight, tables: catalog.length,
    schemaSha256: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), counts };
}

export function queryRows(body) {
  assert(body?.success === true && Array.isArray(body.result) && body.result.length === 1 &&
    body.result[0].success === true && Array.isArray(body.result[0].results), 'invalid_provider_result');
  const result = body.result[0];
  assert((result.meta?.changes ?? 0) === 0 && result.meta?.changed_db !== true, 'unexpected_database_change');
  return result.results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [mode, output] = process.argv.slice(2);
  assert(['preflight', 'audit'].includes(mode) && output && path.isAbsolute(output), 'expected_mode_and_private_output');
  assert(process.env.CLOUDFLARE_API_TOKEN, 'missing_token');
  // Reserve evidence before the first call. Never overwrite an earlier attempt.
  const file = await open(output, 'wx', 0o600);
  const receipt = { at: new Date().toISOString(), account: ACCOUNT, database: DATABASE,
    mode, scope: 'schema_and_counts_only_not_full_value_parity', state: 'started', queries: [] };
  const deadline = AbortSignal.timeout(45_000);
  try {
    const query = async sql => {
      assert(sql === CATALOG || /^SELECT count\(\*\) AS n FROM "[A-Za-z_][A-Za-z_0-9]*"$/.test(sql), 'readonly_query_only');
      assert(receipt.queries.length < 67, 'request_bound');
      const row = { sql, state: 'started' }; receipt.queries.push(row);
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, params: [] }), signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
      });
      row.httpStatus = response.status;
      if (!response.ok) { await response.body?.cancel(); throw new Error(`d1_http_${response.status}`); }
      const body = await response.json();
      row.errorCodes = (body.errors || []).map(error => error.code);
      const rows = queryRows(body); row.state = 'passed'; return rows;
    };
    receipt.result = await readCounts(query, mode); receipt.state = 'passed';
  } catch (error) {
    receipt.state = 'failed'; receipt.error = error.name === 'TimeoutError' ? 'deadline' : error.message;
    process.exitCode = 1;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    await file.writeFile(JSON.stringify(receipt, null, 2) + '\n'); await file.close();
  }
  console.log(JSON.stringify({ state: receipt.state, mode, requests: receipt.queries.length,
    tables: receipt.result?.tables ?? receipt.result?.preflight.length ?? 0 }));
}
