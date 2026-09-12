import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const id = '0041a575-c6fd-4a7e-b9c3-56cc50e201d6';
const oldDescription = { en: "This historic park contains Independence Gate and memorials to Korean independence activists. Seodaemun Prison History Hall explains the site's colonial history." };
const expected = JSON.parse(readFileSync('pilot/catalog.json', 'utf8')).spots.find(spot => spot.id === id);
const sql = readFileSync('pilot/park-photo-update.sql', 'utf8');
function fixture() {
  const db = new DatabaseSync(':memory:');
  for (const name of ['0001_local.sql', '0002_application.sql', '0003_preview_mail.sql', '0004_pilot_catalog.sql', '0005_itineraries.sql']) db.exec(readFileSync(`migrations/${name}`, 'utf8'));
  db.exec("UPDATE runtime_purpose SET purpose = 'localley-preview' WHERE id = 1");
  db.exec(readFileSync('pilot/import.sql', 'utf8'));
  db.prepare("UPDATE spots SET description = ?, photos = '[]', photo_credits = '[]' WHERE id = ?").run(JSON.stringify(oldDescription), id);
  return db;
}

test('park photograph has exact reviewed bytes, author, source, historical date and license', () => {
  const image = readFileSync(`pilot/images/${id}.jpg`);
  assert.equal(image.length, 1714706);
  assert.equal(createHash('sha256').update(image).digest('hex'), '14c9c3a438e9f93980757be9c4654ed92dc658cebe2a90dcbfbf6ef7aaf17a75');
  assert.deepEqual([...image.subarray(0, 3)], [255, 216, 255]);
  assert.deepEqual(expected.photos, [`/pilot/${id}.jpg`]);
  assert.equal(expected.photoCredits[0].author, '\uC720\uC790\uCC28');
  assert.equal(expected.photoCredits[0].takenAt, '2018-06-16');
  assert.equal(expected.photoCredits[0].licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.ok(expected.description.en.includes('historical photograph'));
  assert.ok(expected.description.en.includes('2018'));
  const notice = readFileSync('pilot/licenses.md', 'utf8');
  assert.ok(notice.includes(expected.photoCredits[0].sourceUrl));
  assert.ok(notice.includes('No crop, recompression, generation, or metadata removal'));
});

test('approved image update changes one row once and preserves identity, geometry and related data', () => {
  const db = fixture();
  try {
    const owner = randomUUID(), save = randomUUID(), itinerary = randomUUID();
    db.prepare("INSERT INTO owners VALUES (?, 'new')").run(owner);
    db.prepare('INSERT INTO saved_spots VALUES (?, ?, ?, ?)').run(save, owner, id, 1234567890123);
    const activity = JSON.stringify([{ day: 1, activities: [{ name: expected.name.en, spotId: id }] }]);
    db.prepare("INSERT INTO itineraries (id, ownerId, title, city, days, activities) VALUES (?, ?, 'SYNTHETIC private trip', 'Seoul', 1, ?)").run(itinerary, owner, activity);
    const before = db.prepare('SELECT * FROM spots ORDER BY id').all();
    const relationships = ['saved_spots', 'itineraries'].map(table => db.prepare(`SELECT * FROM ${table}`).all());
    assert.equal(db.prepare(sql).run().changes, 1);
    const updated = db.prepare('SELECT * FROM spots WHERE id = ?').get(id);
    for (const key of Object.keys(updated).filter(key => !['description', 'photos', 'photo_credits'].includes(key))) assert.deepEqual(updated[key], before.find(row => row.id === id)[key]);
    assert.deepEqual(JSON.parse(updated.description), expected.description);
    assert.deepEqual(JSON.parse(updated.photos), expected.photos);
    assert.deepEqual(JSON.parse(updated.photo_credits), expected.photoCredits);
    assert.deepEqual(db.prepare('SELECT * FROM spots WHERE id != ? ORDER BY id').all(id), before.filter(row => row.id !== id));
    assert.equal(db.prepare(sql).run().changes, 0);
    assert.deepEqual(['saved_spots', 'itineraries'].map(table => db.prepare(`SELECT * FROM ${table}`).all()), relationships);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
});

test('park publication refuses a database without the explicit preview purpose', () => {
  const db = fixture();
  try {
    db.exec("UPDATE runtime_purpose SET purpose = 'unset' WHERE id = 1");
    const before = db.prepare('SELECT * FROM spots ORDER BY id').all();
    assert.equal(db.prepare(sql).run().changes, 0);
    assert.deepEqual(db.prepare('SELECT * FROM spots ORDER BY id').all(), before);
  } finally { db.close(); }
});

for (const [field, value] of [['visible', 0], ['name', '{"en":"Another park"}'], ['address', 'Other address'], ['latitude', 37.6], ['description', '{"en":"New curated facts"}'], ['photos', '["/pilot/other.jpg"]'], ['photo_credits', '[{"author":"Other"}]'], ['source_urls', '[]']]) {
  test(`park approval refuses changed ${field} without overwriting a newer decision`, () => {
    const db = fixture();
    try {
      db.prepare(`UPDATE spots SET ${field} = ? WHERE id = ?`).run(value, id);
      const before = db.prepare('SELECT * FROM spots ORDER BY id').all();
      assert.equal(db.prepare(sql).run().changes, 0);
      assert.deepEqual(db.prepare('SELECT * FROM spots ORDER BY id').all(), before);
    } finally { db.close(); }
  });
}
