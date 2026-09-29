import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rehearseImport } from './rehearse-import.mjs';

test('refuses mismatched SQL or owner snapshot before allocating a D1', async () => {
  const root = await mkdtemp(join(tmpdir(), 'localley-d1-rehearsal-'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const sql = "INSERT INTO legacy_import_batches VALUES ('batch-id');\n";
  const sqlFile = join(root, 'import.sql'), sourceReport = join(root, 'report.json'), ownersReport = join(root, 'owners.json');
  const input = { sqlFile, sourceReport, ownersReport, snapshotDir: root, migrationsDir: join(root, 'missing'),
    workerFile: join(root, 'missing.mjs'), stateRoot: root, output: join(root, 'd1.json') };
  try {
    await writeFile(join(root, 'manifest.json'), '{}');
    await writeFile(sqlFile, sql);
    await writeFile(sourceReport, JSON.stringify({ batchId: 'batch-id', statements: 1, sqlSha256: sha(sql), rehearsal: { mismatchCount: 0, repeatChanges: 0, foreignKeyViolations: 0 } }));
    await writeFile(ownersReport, JSON.stringify({ sourceManifestSha256: sha('{}') }));
    await assert.rejects(rehearseImport(input), /ENOENT/); // matched inputs reach the worker read
    await writeFile(ownersReport, JSON.stringify({ sourceManifestSha256: sha('wrong') }));
    await assert.rejects(rehearseImport(input), /import_sql_report_mismatch/);
    await writeFile(ownersReport, JSON.stringify({ sourceManifestSha256: sha('{}') }));
    await writeFile(sqlFile, sql.replace('batch-id', 'changed'));
    await assert.rejects(rehearseImport(input), /import_sql_report_mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
