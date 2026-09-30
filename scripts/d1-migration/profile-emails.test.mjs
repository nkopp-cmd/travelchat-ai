import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { profileEmailSql, prepareProfileEmailImport } from './profile-emails.mjs';
const row = { id: '04929d90-ad5a-4231-8230-a68ead811ab5', clerk_id: 'user_source', email: "o'hara@example.test" };
test('imports only the exact profile owner, repeats without changes and refuses changed email', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE profiles(id TEXT PRIMARY KEY,ownerId TEXT);');
    db.exec(readFileSync(new URL('../../migrations/app-preview/0025_preview_profile_emails.sql', import.meta.url), 'utf8'));
    db.prepare('INSERT INTO profiles VALUES(?,?)').run(row.id, row.clerk_id);
    const { sql, profiles } = profileEmailSql([row]); assert.equal(profiles, 1);
    db.exec(sql); assert.equal(db.prepare('SELECT email FROM legacy_profile_emails').get().email, row.email);
    db.exec(sql); assert.equal(db.prepare('SELECT changes() AS n').get().n, 0);
    assert.throws(() => db.exec(profileEmailSql([{ ...row, email: 'changed@example.test' }]).sql), /changed/);
    db.exec('DELETE FROM legacy_profile_emails');
    db.exec(profileEmailSql([{ ...row, clerk_id: 'user_wrong' }]).sql);
    assert.equal(db.prepare('SELECT count(*) AS n FROM legacy_profile_emails').get().n, 0);
  } finally { db.close(); }
});
test('refuses duplicate profiles, duplicate owners and unsafe source shapes', () => {
  assert.throws(() => profileEmailSql([row, row]), /duplicate/);
  assert.throws(() => profileEmailSql([{ ...row, email: '\nsecret' }]), /Invalid/);
  assert.throws(() => profileEmailSql([{ ...row, clerk_id: 'wrong' }]), /Invalid/);
});
test('requires a complete snapshot from the expected source and intact page hashes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'localley-profile-email-test-'));
  try {
    const page = JSON.stringify([row]);
    const manifest = { version: 1, complete: true, source: 'https://llehrhqeolfprutcaopi.supabase.co',
      tables: [{ name: 'users', count: 1, pages: [{ file: 'users-0.json', rows: 1,
        sha256: createHash('sha256').update(page).digest('hex') }] }] };
    writeFileSync(join(dir, 'users-0.json'), page);
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    assert.equal((await prepareProfileEmailImport(dir)).profiles, 1);
    writeFileSync(join(dir, 'users-0.json'), '[]');
    await assert.rejects(prepareProfileEmailImport(dir), /hash mismatch/);
    manifest.complete = false;
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(prepareProfileEmailImport(dir), /manifest/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
