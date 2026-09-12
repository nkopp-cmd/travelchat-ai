import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { prepareNativeImport } from '../scripts/native-import.mjs';
import { publicationSql } from '../scripts/native-publish.mjs';

const now = Date.parse('2026-09-12T06:00:00Z');
const source = 'https://english.visitseoul.net/attractions/fixture_/72';
const row = () => ({kind:'place', recordId:'a'.repeat(64), providerPlaceId:'visit-seoul:72', citySlug:'seoul', countryCode:'KR',
  name:{en:"King's palace"}, address:{en:'161 Sajik-ro, Seoul'}, latitude:37.58, longitude:126.97,
  provenance:{sourceUrl:source, observedAt:'2026-09-12T05:00:00Z'}, verified:false, state:'pending', issues:[], images:[]});
const feed = records => ({publicationReady:false, records});
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE spots(id TEXT PRIMARY KEY, name TEXT, photos TEXT, source_urls TEXT, description TEXT, category TEXT, localley_score INTEGER, visible INTEGER, city TEXT, address TEXT, latitude REAL, longitude REAL, photo_credits TEXT);');
  db.exec(readFileSync(new URL('../migrations/0006_native_candidates.sql', import.meta.url),'utf8'));
  db.prepare('INSERT INTO spots(id,name,photos,source_urls) VALUES(?,?,?,?)').run('existing-uuid','Curated name','["/pilot/verified.jpg"]',JSON.stringify([source]));
  return db;
}
test('retry and source aliases preserve one venue, curated content, and existing UUID', () => {
  const db = database();
  try {
    const before = db.prepare('SELECT * FROM spots').all();
    const input = row();
    const imported = prepareNativeImport(feed([input,input]),now);
    assert.equal(imported.accepted,1);
    db.exec(imported.sql); db.exec(imported.sql);
    assert.equal(db.prepare('SELECT count(*) n FROM native_place_candidates').get().n,1);
    assert.equal(db.prepare('SELECT count(*) n FROM native_import_receipts').get().n,1);
    assert.equal(db.prepare('SELECT matched_spot_id id FROM native_place_candidates').get().id,'existing-uuid');
    assert.equal(JSON.parse(db.prepare('SELECT payload FROM native_place_candidates').get().payload).name.en,"King's palace");
    const older = row(); older.name.en='Old name'; older.provenance.observedAt='2026-09-11T05:00:00Z';
    db.exec(prepareNativeImport(feed([older]),now).sql);
    assert.equal(JSON.parse(db.prepare('SELECT payload FROM native_place_candidates').get().payload).name.en,"King's palace");
    assert.deepEqual(db.prepare('SELECT * FROM spots').all(),before);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { db.close(); }
});
test('ambiguous source matches never select an arbitrary spot', () => {
  const db=database();
  try {
    db.prepare('INSERT INTO spots(id,name,photos,source_urls) VALUES(?,?,?,?)').run('other-uuid','Other','[]',JSON.stringify([source]));
    db.exec(prepareNativeImport(feed([row()]),now).sql);
    const result=db.prepare('SELECT match_state, matched_spot_id FROM native_place_candidates').get();
    assert.equal(result.match_state,'ambiguous'); assert.equal(result.matched_spot_id,null);
  } finally { db.close(); }
});
test('invalid provenance, geography, dates, publication state and image URLs fail closed', () => {
  for (const patch of [{citySlug:'busan'}, {latitude:35.1}, {latitude:'37.5'}, {name:{en:'<script>x</script>'}},
    {verified:true}, {providerPlaceId:'google:made-up'}, {provenance:{sourceUrl:'https://evil.example/_/72',observedAt:'2026-09-12T05:00:00Z'}},
    {provenance:{sourceUrl:source,observedAt:'2027-09-12T05:00:00Z'}}, {images:[{sourceUrl:'http://127.0.0.1/private'}]}]) {
    const result=prepareNativeImport(feed([{...row(),...patch}]),now);
    assert.equal(result.accepted,0); assert.equal(result.rejected.length,1);
  }
  assert.throws(()=>prepareNativeImport({publicationReady:true,records:[row()]},now));
});
test('bounded inputs accept the versioned export and never include public table mutations', () => {
  const result=prepareNativeImport({schemaVersion:'localley-native-v1',citySlug:'seoul',collection:{paidProviderCalls:0},publicationReady:false,places:[row()]},now);
  assert.equal(result.accepted,1);
  assert.doesNotMatch(result.sql, /(?:INSERT INTO|UPDATE|DELETE FROM) spots/);
  assert.throws(()=>prepareNativeImport(feed(Array(5001).fill(row())),now));
});

test('reviewed publication requires matching native facts and cannot overwrite existing public records', () => {
  const review=JSON.parse(readFileSync(new URL('../pilot/native-reviewed.json',import.meta.url))).spots[0];
  const db=database();
  try {
    const candidate={...row(),providerPlaceId:review.providerPlaceId,name:review.name,address:{en:review.address},
      latitude:review.latitude,longitude:review.longitude,provenance:{sourceUrl:review.sourceUrl,observedAt:'2026-09-12T05:00:00Z'}};
    const sql=publicationSql(review);
    db.exec(sql);
    assert.equal(db.prepare('SELECT count(*) n FROM spots').get().n,1,'Missing native evidence cannot publish');
    db.exec(prepareNativeImport(feed([{...candidate,latitude:37.6}]),now).sql);db.exec(sql);
    assert.equal(db.prepare('SELECT count(*) n FROM spots').get().n,1,'Changed native coordinates require review');
    db.exec(prepareNativeImport(feed([candidate]),now).sql);db.exec(sql);db.exec(sql);
    assert.equal(db.prepare('SELECT count(*) n FROM spots').get().n,2);
    const place=db.prepare('SELECT * FROM spots WHERE id=?').get(review.id);
    assert.equal(JSON.parse(place.name).en,review.name.en);
    assert.deepEqual(JSON.parse(place.photos),review.photos);
    assert.equal(db.prepare('SELECT name FROM spots WHERE id=?').get('existing-uuid').name,'Curated name');
    assert.throws(()=>publicationSql({...review,imageSha256:'0'.repeat(64)}),/bytes changed/);
    assert.throws(()=>publicationSql({...review,photoCredits:[{...review.photoCredits[0],license:'unknown'}]}),/license/);
  } finally { db.close(); }
});
