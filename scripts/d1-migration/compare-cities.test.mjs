import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCityCounts, compareCurrentCities, readPinnedCatalog } from './compare-cities.mjs';
import { projectImportedCities } from '../../lib/app-data/city-counts.ts';

const sql = Buffer.from([
  "INSERT OR IGNORE INTO spots (id, visible) VALUES ('spot-a', 1);",
  `INSERT OR IGNORE INTO legacy_spot_source (spotId, payload, publicIssue) VALUES ('spot-a', '{"name":{"en":"One"}}', NULL);`,
].join('\n') + '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const report = () => ({ sqlSha256: hash(sql), statements: 2,
  counts: { spots: 1, legacy_spot_source: 1 } });

test('reads only hash-pinned catalog rows through in-memory SQLite', () => {
  assert.deepEqual(readPinnedCatalog(sql, report()).map(row => ({ ...row })),
    [{ payload: '{"name":{"en":"One"}}', visible: 1 }]);
});

test('refuses changed SQL, wrong counts and missing spot links', () => {
  assert.throws(() => readPinnedCatalog(Buffer.from(sql.toString() + ' '), report()), /does not match/);
  assert.throws(() => readPinnedCatalog(sql, { ...report(),
    counts: { spots: 2, legacy_spot_source: 1 } }), /count mismatch/);
  const unlinked = Buffer.from(sql.toString().replaceAll('spot-a', 'spot-b')
    .replace("VALUES ('spot-b', 1)", "VALUES ('spot-a', 1)"));
  assert.throws(() => readPinnedCatalog(unlinked, { ...report(), sqlSha256: hash(unlinked) }),
    /missing spot links/);
});

test('reports exact differences and refuses malformed live counts', () => {
  const imported = [{ slug: 'seoul', spotCount: 2 }, { slug: 'tokyo', spotCount: 1 }];
  assert.deepEqual(compareCityCounts(imported,
    [{ slug: 'tokyo', spotCount: 1 }, { slug: 'seoul', spotCount: 2 }]), []);
  assert.deepEqual(compareCityCounts(imported,
    [{ slug: 'seoul', spotCount: 1 }, { slug: 'tokyo', spotCount: 1 }]),
    [{ slug: 'seoul', live: 1, imported: 2, delta: 1 }]);
  assert.throws(() => compareCityCounts(imported, [{ slug: 'seoul', spotCount: 2 }]), /incomplete/);
});

test('uses a GET only and removes temporary fixture files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'localley-city-drift-'));
  try {
    const sqlFile = join(dir, 'import.sql');
    const reportFile = join(dir, 'report.json');
    await Promise.all([writeFile(sqlFile, sql), writeFile(reportFile, JSON.stringify(report()))]);
    const cities = projectImportedCities([{ payload: '{"name":{"en":"One"}}', visible: 1 }])
      .map(({ slug, spotCount }) => ({ slug, spotCount }));
    const request = async (url, options) => {
      assert.equal(url, 'https://www.localley.io/api/cities?noCache=true&includeHidden=true');
      assert.equal(options.method, 'GET');
      return new Response(JSON.stringify({ success: true, cities, total: cities.length }), { status: 200 });
    };
    const result = await compareCurrentCities(sqlFile, reportFile, request);
    assert.equal(result.importedSpots, 1);
    assert.equal(result.cityCount, cities.length);
    assert.deepEqual(result.differences, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
