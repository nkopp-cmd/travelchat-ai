import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, countSql, readCounts, queryRows } from './count-preflight.mjs';

const catalog = [{ name: 'owners', sql: 'CREATE TABLE owners(id TEXT)' },
  { name: 'itineraries', sql: 'CREATE TABLE itineraries(id TEXT)' },
  ...Array.from({ length: 54 }, (_, i) => ({ name: `table_${i}`, sql: `CREATE TABLE table_${i}(id TEXT)` }))];

test('single-table identifiers cannot add SQL terms or writes', () => {
  assert.equal(countSql('owners'), 'SELECT count(*) AS n FROM "owners"');
  for (const name of ['x"', 'x;DROP TABLE user', 'x UNION ALL SELECT 1', '', null])
    assert.throws(() => countSql(name));
});
test('preflight only reads two separate counts', async () => {
  const calls = []; const result = await readCounts(async sql => { calls.push(sql); return [{ n: 0 }]; }, 'preflight');
  assert.deepEqual(calls, [countSql('owners'), countSql('itineraries')]);
  assert.equal(result.preflight.length, 2);
});
test('complete56-table audit is sequential with no compound SQL', async () => {
  const calls = []; let active = false;
  const result = await readCounts(async sql => {
    assert.equal(active, false); active = true; calls.push(sql);
    await Promise.resolve(); active = false;
    assert.ok(!sql.includes('UNION') && !sql.includes(';'));
    return sql === CATALOG ? catalog : [{ n: 10 }];
  }, 'audit');
  assert.equal(calls.length, 59); assert.equal(result.counts.length, 56);
  assert.equal(new Set(result.counts.map(row => row.table)).size, 56);
});
test('oversized, duplicated and malformed catalogs stop before audit counts', async () => {
  for (const rows of [[], [...catalog, ...catalog], [...catalog.slice(0, -1), catalog[0]],
    [...catalog.slice(0, -1), { name: 'bad"identifier', sql: '' }]]) {
    let calls = 0;
    await assert.rejects(() => readCounts(async sql => { calls++; return sql === CATALOG ? rows : [{ n: 1 }]; }, 'audit'));
    assert.equal(calls, 3);
  }
});
test('invalid counts and provider failure cannot produce success', async () => {
  for (const rows of [[], [{ n: -1 }], [{ n: '1' }], [{ n: 1 }, { n: 2 }]])
    await assert.rejects(() => readCounts(async () => rows, 'preflight'));
  for (const body of [{ success: false }, { success: true, result: [] },
    { success: true, result: [{ success: true, results: [], meta: { changes: 1 } }] }])
    assert.throws(() => queryRows(body));
});
test('first failed single-table read stops without retry', async () => {
  let calls = 0;
  await assert.rejects(() => readCounts(async () => { calls++; throw new Error('provider_failure'); }, 'audit'));
  assert.equal(calls, 1);
});
