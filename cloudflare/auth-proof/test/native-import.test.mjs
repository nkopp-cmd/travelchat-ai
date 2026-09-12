import test from 'node:test';
import './native-preview.test.mjs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareNativeImport } from '../scripts/native-import.mjs';
import { publicationSql as buildPublicationSql } from '../scripts/native-publish.mjs';

const now = Date.parse('2026-09-12T06:00:00Z');
const source = 'https://english.visitseoul.net/attractions/fixture_/72';
const row = () => ({kind:'place', recordId:'a'.repeat(64), providerPlaceId:'visit-seoul:72', citySlug:'seoul', countryCode:'KR',
  name:{en:"King's palace"}, address:{en:'161 Sajik-ro, Seoul'}, latitude:37.58, longitude:126.97,
  provenance:{sourceUrl:source, observedAt:'2026-09-12T05:00:00Z'}, verified:false, state:'pending', issues:[], images:[]});
const feed = records => ({publicationReady:false, records});
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE spots(id TEXT PRIMARY KEY, name TEXT, photos TEXT, source_urls TEXT, description TEXT, category TEXT, localley_score INTEGER, visible INTEGER, city TEXT, address TEXT, latitude REAL, longitude REAL, photo_credits TEXT);');
  db.exec("CREATE TABLE runtime_purpose(id INTEGER PRIMARY KEY, purpose TEXT); INSERT INTO runtime_purpose VALUES(1,'localley-preview');");
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

const publicReviews = JSON.parse(readFileSync(new URL('../pilot/native-reviewed.json',import.meta.url))).spots;
// These are synthetic private observations, not copied collector payloads. Fixture hashes never replace public pins.
const sourceRecords = publicReviews.map(review => ({...row(),recordId:review.actualCandidate.recordId,
  providerPlaceId:review.providerPlaceId,name:{en:review.actualCandidate.sourceNameEn},address:{en:review.address},
  latitude:review.latitude,longitude:review.longitude,category:null,localleyScore:null,
  description:{en:'Synthetic private observation for SQL fixtures.'},
  images:[{sourceUrl:'https://english.visitseoul.net/comm/getImage?srvcId=MEDIA&fixture=1',sha256:null}],
  provenance:{sourceUrl:review.sourceUrl,observedAt:review.actualCandidate.observedAt}}));
const reviews = publicReviews.map((review,index) => ({...structuredClone(review),actualCandidate:{...review.actualCandidate,
  payloadSha256:createHash('sha256').update(JSON.stringify(sourceRecords[index])).digest('hex')}}));
const candidateFor = review => structuredClone(sourceRecords.find(record=>record.providerPlaceId===review.providerPlaceId));
const publicationSql = input => buildPublicationSql(input,sourceRecords,reviews);

test('publication requires explicit private observations and accepts only supported envelopes',()=>{
  for (const input of [undefined,[],{},feed([]),{publicationReady:true,records:sourceRecords},
    {publicationReady:false,schemaVersion:'unknown',records:sourceRecords},
    {publicationReady:false,schemaVersion:'localley-native-v1',citySlug:'seoul',collection:{paidProviderCalls:1},places:sourceRecords},
    Array(5001).fill(sourceRecords[0])]) assert.throws(()=>buildPublicationSql(reviews,input,reviews));
  const versioned={publicationReady:false,schemaVersion:'localley-native-v1',citySlug:'seoul',collection:{paidProviderCalls:0},
    places:sourceRecords.map(({kind,...record})=>record)};
  assert.equal(buildPublicationSql(reviews,versioned,reviews),publicationSql(reviews));
  assert.equal(buildPublicationSql(reviews,feed(sourceRecords),reviews),publicationSql(reviews));
  assert.throws(()=>buildPublicationSql(reviews,sourceRecords),'Default registry must reject synthetic approval hashes');
  assert.throws(()=>buildPublicationSql(publicReviews,sourceRecords),'Synthetic snapshots cannot satisfy the real pins');
});

for (const [name,change] of Object.entries({
  'missing snapshot': rows=>{rows.pop();},
  'wrong source key': rows=>{rows.at(-1).providerPlaceId='visit-seoul:999';},
  'wrong source URL': rows=>{rows.at(-1).provenance.sourceUrl='https://evil.example/549';},
  'wrong record ID': rows=>{rows.at(-1).recordId='0'.repeat(64);},
  'wrong hash': rows=>{rows.at(-1).description.en='Changed synthetic evidence';},
  'missing snapshot date': rows=>{delete rows.at(-1).provenance.observedAt;},
  'older snapshot': rows=>{rows.at(-1).provenance.observedAt='2026-09-11T03:30:42.795Z';},
  'newer unreviewed snapshot': rows=>{const next=structuredClone(rows.at(-1));next.provenance.observedAt='2026-09-12T05:00:00Z';rows.push(next);},
  'conflicting same-time snapshot': rows=>{const next=structuredClone(rows.at(-1));next.description.en='Conflicting fixture';rows.push(next);},
})) test(`private input rejects ${name} before SQL generation`,()=>{
  const records=structuredClone(sourceRecords);change(records);
  assert.throws(()=>buildPublicationSql(reviews,records,reviews),/private observation/);
});

test('identical snapshot repeats and older observations retain the same pinned batch',()=>{
  const older=structuredClone(sourceRecords.at(-1));older.provenance.observedAt='2026-09-11T03:30:42.795Z';
  assert.equal(buildPublicationSql(reviews,[older,...sourceRecords,...sourceRecords],reviews),publicationSql(reviews));
});

test('public review contains only public facts and unchanged pins; raw inputs stay outside public files',()=>{
  const text=readFileSync(new URL('../pilot/native-reviewed.json',import.meta.url),'utf8');
  assert.doesNotMatch(text,/sourceFields|privateAssetPath|jobId|\/comm\/getImage|Synthetic private observation/);
  const expectedHashes=[
    '537bed9a1d5530f23b6489a4076df63f9caa3c63a881560817139f8da7c57884',
    '64162be08484985378dda972d5ff288f551944b3f8fd1d21e4eb233f9fad8a7f',
    'a29b67c1606c67d6f42d8eef0110a2627b7fda9a93b3b5dab143e8019842ff18',
    'e4bc5c4e1e67741d61689f7cfc5821055dd54ed0282841099732c2b7990c4da2',
    '44c8fbf3d5190021c8a006b35f7cbfbd6381e517974f54acff7f30be3bf59b19',
  ];
  assert.deepEqual(publicReviews.map(r=>r.actualCandidate.payloadSha256),expectedHashes);
  for (const review of publicReviews) assert.deepEqual(Object.keys(review.actualCandidate).sort(),['recordId','payloadSha256','observedAt','sourceNameEn'].sort());
  assert.match(readFileSync(new URL('../.gitignore',import.meta.url),'utf8'),/^\.preview-private\/$/m);
  const files=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).files;
  assert.ok(!files.some(file=>file.includes('pilot')||file.includes('preview-private')));
  const assets=JSON.parse(readFileSync(new URL('../pilot/manifest.json',import.meta.url))).files;
  assert.ok(assets.every(asset=>/^[a-f0-9-]+\.jpg$/.test(asset.file)));
  const evidence=new URL('../pilot/new-native-review-20260912/',import.meta.url);
  for (const file of readdirSync(evidence).filter(file=>/\.(md|json)$/.test(file))) {
    assert.ok(!/\/api\/intelligence\/assets\/|research-[a-f0-9]{64}|"jobId"\s*:/.test(readFileSync(new URL(file,evidence),'utf8')),'Public review evidence must not contain raw private references');
  }
});

test('five approved reviews insert once; museum and unrelated public rows never mutate', () => {
  const db=database();
  try {
    db.exec(prepareNativeImport(feed(reviews.map(candidateFor)),now).sql);
    db.exec(publicationSql(reviews[0]));
    const museum=db.prepare('SELECT * FROM spots WHERE id=?').get(reviews[0].id);
    const sql=publicationSql(reviews);
    const [insert, afterInsert]=sql.split(';\nWITH reviewed');
    const inserted=db.prepare(insert).all();
    assert.deepEqual(inserted.map(r=>r.insertedPreviewId).sort(),reviews.slice(1).map(r=>r.id).sort(),'Exactly four new preview rows, not five');
    db.exec('WITH reviewed'+afterInsert);
    const before=db.prepare('SELECT total_changes() n').get().n;
    db.exec(sql);
    assert.equal(db.prepare('SELECT total_changes() n').get().n,before,'Exact repeats perform no mutations');
    assert.equal(db.prepare('SELECT count(*) n FROM spots').get().n,6);
    assert.deepEqual(db.prepare('SELECT * FROM spots WHERE id=?').get(reviews[0].id),museum);
    for (const review of reviews) {
      const place=db.prepare('SELECT * FROM spots WHERE id=?').get(review.id);
      assert.equal(JSON.parse(place.name).en,review.name.en);
      assert.equal(place.category,review.category);
      assert.equal(place.localley_score,null);
      assert.deepEqual(JSON.parse(place.photos),review.photos);
      assert.deepEqual(JSON.parse(place.photo_credits),review.photoCredits);
      assert.deepEqual(JSON.parse(place.source_urls),review.sourceUrls);
    }
    assert.equal(db.prepare('SELECT name FROM spots WHERE id=?').get('existing-uuid').name,'Curated name');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { db.close(); }
});

test('private binding rechecks evidence if a newer import arrives between statements',()=>{
  const db=database();
  try {
    const review=reviews.at(-1);
    db.exec(prepareNativeImport(feed([candidateFor(review)]),now).sql);
    const [insert,update]=publicationSql(review).split(';\nWITH reviewed');
    db.exec(insert);
    const candidate=candidateFor(review);
    candidate.provenance.sourceUrl='https://english.visitseoul.net/attractions/Other_/550';
    candidate.provenance.observedAt='2026-09-12T05:30:00Z';
    db.exec(prepareNativeImport(feed([candidate]),now).sql);
    const before=db.prepare('SELECT * FROM native_place_candidates').all();
    db.exec('WITH reviewed'+update);
    assert.deepEqual(db.prepare('SELECT * FROM native_place_candidates').all(),before);
    assert.equal(before[0].matched_spot_id,null);
  } finally {db.close();}
});

const reviewNegatives = {
  'image hash': r=>{r.imageSha256='0'.repeat(64);},
  'unknown license': r=>{r.photoCredits[0].license='unknown';},
  'KOGL restricted type': r=>{r.photoCredits[0].license='KOGL Type 2';},
  'wrong exact license URL': r=>{r.photoCredits[0].licenseUrl+='?unreviewed';},
  'missing author': r=>{r.photoCredits[0].author=' ';},
  'unreviewed Commons file': r=>{r.photoCredits[0].sourceUrl='https://commons.wikimedia.org/wiki/File:Other.jpg';},
  'unreviewed archive file': r=>{r.photoCredits[0].sourceUrl='https://archive.visitseoul.net/en/contents/ARP007jo1';},
  'source gallery rights assumption': r=>{r.photoCredits[0].sourceUrl='https://english.visitseoul.net/comm/getImage?srvcId=MEDIA';},
  'foreign source': r=>{r.sourceUrl='https://evil.example/attractions/_/549';},
  'source userinfo': r=>{r.sourceUrl=r.sourceUrl.replace('https://','https://user@');},
  'wrong image path': r=>{r.photos[0]='/pilot/other.jpg';},
  'wrong credit path': r=>{r.photoCredits[0].url='/pilot/other.jpg';},
  'multiple images': r=>{r.photos.push(r.photos[0]);},
  'path traversal ID': r=>{r.id='../images/not-approved';},
  'unapproved identity': r=>{r.legacyMapping={status:'reviewed_existing_uuid',legacyId:r.id};},
  'existing UUID mismatch': r=>{r.legacyMapping={status:'reviewed_existing_uuid',legacyId:reviews[0].id,identityReviewReference:'anything'};},
  'unapproved category': r=>{r.category='food';},
  'latitude NaN': r=>{r.latitude=NaN;},
  'longitude Infinity': r=>{r.longitude=Infinity;},
  'foreign geography': r=>{r.latitude=35.1;},
  'string coordinates': r=>{r.longitude=String(r.longitude);},
  'invalid score': r=>{r.localleyScore=NaN;},
  'caller score': r=>{r.localley_score=5;},
  'unreviewed source URLs': r=>{r.sourceUrls.push('https://evil.example');},
  'native alias silently rewritten': r=>{r.actualCandidate.sourceNameEn='Jongmyo';},
  'native hash': r=>{r.actualCandidate.recordId='0'.repeat(64);},
  'native payload hash': r=>{r.actualCandidate.payloadSha256='0'.repeat(64);},
  'raw source fields added to public review': r=>{r.actualCandidate.sourceFields={name:{en:'Synthetic'}};},
  'native observation': r=>{r.actualCandidate.observedAt='2026-09-11T03:30:42.795Z';},
  'historical caption missing': r=>{delete r.photoCredits[0].caption;},
  'historical date missing': r=>{delete r.photoCredits[0].takenAt;},
  'historical description missing': r=>{r.description.en='A current view.';},
};
for (const [name,change] of Object.entries(reviewNegatives)) test(`publication rejects ${name}`,()=>{
  const review=structuredClone(reviews.at(-1)); change(review);
  assert.throws(()=>publicationSql(review));
});
test('publication rejects empty, duplicate, and oversized review batches',()=>{
  for (const batch of [[],[reviews[0],reviews[0]],Array(21).fill(reviews[0])]) assert.throws(()=>publicationSql(batch));
});

const nativeNegatives = {
  'stale record hash': c=>{c.recordId='0'.repeat(64);},
  'older observation': c=>{c.provenance.observedAt='2026-09-11T03:30:42.795Z';},
  'new unreviewed observation': c=>{c.provenance.observedAt='2026-09-12T05:30:42.795Z';},
  'wrong heading': c=>{c.name.en='Nearby park';},
  'same record different payload': c=>{c.description.en='Unreviewed description';},
  'unreviewed gallery bytes': c=>{c.images[0].sha256='0'.repeat(64);},
  'wrong address': c=>{c.address.en='Other address';},
  'wrong latitude': c=>{c.latitude=37.6;},
  'wrong longitude': c=>{c.longitude=127.1;},
  'string latitude': c=>{c.latitude=String(c.latitude);},
  'missing issues': c=>{delete c.issues;},
  'foreign city': c=>{c.citySlug='busan';},
  'foreign country': c=>{c.countryCode='JP';},
  'foreign source': c=>{c.provenance.sourceUrl='https://evil.example/549';},
  'wrong provider': c=>{c.providerPlaceId='visit-seoul:35';},
  'non-place': c=>{c.kind='social';},
  'verified flag': c=>{c.verified=true;},
  'string verified flag': c=>{c.verified='false';},
  'public state': c=>{c.state='published';},
  'source score': c=>{c.localleyScore=99;},
  'source category': c=>{c.category='Food';},
  'quality issue': c=>{c.issues.push('missing_address');},
};
for (const [name,change] of Object.entries(nativeNegatives)) test(`native ${name} rejects the entire batch without partial writes`,()=>{
  const db=database();
  try {
    db.exec(prepareNativeImport(feed(reviews.map(candidateFor)),now).sql);
    const candidate=candidateFor(reviews.at(-1)); change(candidate);
    db.prepare('UPDATE native_place_candidates SET payload=? WHERE source_key=?')
      .run(JSON.stringify(candidate),`english.visitseoul.net:${reviews.at(-1).providerPlaceId}`);
    const before=db.prepare('SELECT * FROM native_place_candidates').all();
    assert.throws(()=>db.exec(publicationSql(reviews)),/malformed JSON/);
    assert.equal(db.prepare('SELECT count(*) n FROM spots').get().n,1);
    assert.deepEqual(db.prepare('SELECT * FROM native_place_candidates').all(),before);
  } finally {db.close();}
});

for (const collision of ['non-preview target','missing candidate','UUID','source','matched unrelated','ambiguous','wrong stored review','candidate timestamp']) test(`${collision} fails without partial publication`,()=>{
  const db=database(); const review=reviews.at(-1); const key=`english.visitseoul.net:${review.providerPlaceId}`;
  try {
    db.exec(prepareNativeImport(feed(reviews.map(candidateFor)),now).sql);
    if (collision==='non-preview target') db.exec("UPDATE runtime_purpose SET purpose='unset'");
    if (collision==='missing candidate') db.prepare('DELETE FROM native_place_candidates WHERE source_key=?').run(key);
    if (collision==='UUID') db.prepare('INSERT INTO spots(id,name,source_urls) VALUES(?,?,?)').run(review.id,'Unrelated','[]');
    if (collision==='source') db.prepare('INSERT INTO spots(id,name,source_urls) VALUES(?,?,?)').run('collision','Unrelated',JSON.stringify([review.sourceUrl]));
    if (collision==='matched unrelated') db.prepare("UPDATE native_place_candidates SET match_state='exact_source',matched_spot_id='existing-uuid' WHERE source_key=?").run(key);
    if (collision==='ambiguous') db.prepare("UPDATE native_place_candidates SET match_state='ambiguous' WHERE source_key=?").run(key);
    if (collision==='candidate timestamp') db.prepare("UPDATE native_place_candidates SET observed_at='2026-09-11T03:30:42.795Z' WHERE source_key=?").run(key);
    if (collision==='wrong stored review') {
      db.exec(publicationSql(review));
      db.prepare("UPDATE spots SET name='Unrelated' WHERE id=?").run(review.id);
    }
    const before=db.prepare('SELECT * FROM spots').all();
    const candidates=db.prepare('SELECT * FROM native_place_candidates').all();
    assert.throws(()=>db.exec(publicationSql(reviews)),/malformed JSON/);
    assert.deepEqual(db.prepare('SELECT * FROM spots').all(),before);
    assert.deepEqual(db.prepare('SELECT * FROM native_place_candidates').all(),candidates);
  } finally {db.close();}
});

test('all staged assets match manifest, JPEG magic, and exact approved research bytes',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../pilot/manifest.json',import.meta.url)));
  const research=['ddp-ARP007nc1.jpg','sewoon-ARP007ev1.jpg','gwangjang-bgag-20220926.jpg','jongmyo-cha-20130813.jpg'];
  assert.equal(manifest.files.length,7);
  for (const asset of manifest.files) {
    const bytes=readFileSync(new URL(`../pilot/images/${asset.file}`,import.meta.url));
    assert.equal(bytes.subarray(0,3).toString('hex'),'ffd8ff');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  }
  for (const [index,review] of publicReviews.slice(1).entries()) {
    const bytes=readFileSync(new URL(`../pilot/images/${review.id}.jpg`,import.meta.url));
    assert.deepEqual(bytes,readFileSync(new URL(`../pilot/new-native-review-20260912/${research[index]}`,import.meta.url)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),review.imageSha256);
  }
});

test('generator rejects non-JPEG and changed bytes; CLI receipt never claims insertions',async()=>{
  const state=mkdtempSync(join(tmpdir(),'localley-native-generator-'));
  try {
    mkdirSync(join(state,'scripts')); mkdirSync(join(state,'pilot')); mkdirSync(join(state,'pilot/images'));
    copyFileSync(new URL('../scripts/native-publish.mjs',import.meta.url),join(state,'scripts/native-publish.mjs'));
    // This isolated script copy has an explicit synthetic registry. The real CLI has no registry override.
    writeFileSync(join(state,'pilot/native-reviewed.json'),JSON.stringify({spots:reviews}));
    for (const review of reviews) copyFileSync(new URL(`../pilot/images/${review.id}.jpg`,import.meta.url),join(state,`pilot/images/${review.id}.jpg`));
    const {publicationSql:fixtureSql}=await import(pathToFileURL(join(state,'scripts/native-publish.mjs')).href);
    const image=join(state,`pilot/images/${reviews[0].id}.jpg`);
    const bytes=readFileSync(image);
    writeFileSync(image,Buffer.from('RIFFnot-a-jpeg'));
    assert.throws(()=>fixtureSql(reviews[0],sourceRecords),/JPEG required/);
    writeFileSync(image,Buffer.concat([bytes,Buffer.from('changed')]));
    assert.throws(()=>fixtureSql(reviews[0],sourceRecords),/bytes changed/);
    rmSync(image);
    symlinkSync(new URL(`../pilot/images/${reviews[0].id}.jpg`,import.meta.url),image);
    assert.throws(()=>fixtureSql(reviews[0],sourceRecords),/regular file/);
    rmSync(image);
    writeFileSync(image,bytes);
    const output=join(state,'publication.sql');
    const input=join(state,'private-observations.json');
    writeFileSync(input,JSON.stringify(feed(sourceRecords)),{mode:0o600});
    const args=[join(state,'scripts/native-publish.mjs'),input,output];
    const run=spawnSync(process.execPath,args,{encoding:'utf8',env:{PATH:process.env.PATH,TMPDIR:tmpdir()}});
    assert.equal(run.status,0,run.stderr);
    const receipt=JSON.parse(run.stdout);
    assert.equal(receipt.reviewedPlaces,5);
    assert.equal(receipt.maximumInsertions,5);
    assert.equal(receipt.insertedPlaces,null);
    assert.match(receipt.insertionReceipt,/INSERT RETURNING/);
    const sql=readFileSync(output,'utf8');
    assert.match(sql,/RETURNING id AS insertedPreviewId/);
    assert.doesNotMatch(sql,/ON CONFLICT|UPDATE spots|DELETE FROM spots|BEGIN TRANSACTION|COMMIT;/);
    assert.notEqual(spawnSync(process.execPath,args,{env:{PATH:process.env.PATH,TMPDIR:tmpdir()}}).status,0,'Never overwrite generated SQL');
    const rejectedOutput=join(state,'rejected.sql');
    const realScript=fileURLToPath(new URL('../scripts/native-publish.mjs',import.meta.url));
    for (const rejectedArgs of [[realScript,input,rejectedOutput],
      [realScript,input,rejectedOutput,'--registry',join(state,'pilot/native-reviewed.json')],
      [realScript,rejectedOutput]]) {
      const rejected=spawnSync(process.execPath,rejectedArgs,{encoding:'utf8',env:{PATH:process.env.PATH,TMPDIR:tmpdir()}});
      assert.notEqual(rejected.status,0);
      assert.equal(rejected.stdout,'');
      assert.ok(!existsSync(rejectedOutput),'Rejected private input must not create SQL');
    }
    writeFileSync(input,'{"privateMalformedMarker": "sensitive-fixture');
    const malformed=spawnSync(process.execPath,[realScript,input,rejectedOutput],{encoding:'utf8',env:{PATH:process.env.PATH,TMPDIR:tmpdir()}});
    assert.notEqual(malformed.status,0);
    assert.doesNotMatch(malformed.stderr,/privateMalformedMarker|sensitive-fixture/);
    assert.ok(!existsSync(rejectedOutput));
  } finally {rmSync(state,{recursive:true,force:true});}
});

test('D1 executes guarded publication and rejects collisions atomically',async()=>{
  const {Miniflare}=await import('miniflare');
  const state=mkdtempSync(join(tmpdir(),'localley-native-d1-'));
  const mf=new Miniflare({workers:[{config:{name:'native-publication-fixture',type:'worker',compatibilityDate:'2026-09-08',
    manifest:{mainModule:'fixture.mjs',modulesRoot:resolve('test'),modules:{'fixture.mjs':{type:'esm',contents:'export default {fetch(){return new Response("fixture")}}'}}},
    env:{DB:{type:'d1',id:'native-publication-fixture',dev:{remote:false}}}},
    dev:{outboundService:{type:'fetcher',handler:()=>{throw new Error('No outbound requests allowed');}}}}],
    resourcePersistencePath:state,resourceTmpPath:state,telemetry:{enabled:false},cf:false,logRequests:false,unsafeLocalExplorer:false});
  try {
    const db=await mf.getD1Database('DB');
    // D1 exec is line-oriented. Prepare each complete fixture statement, including multiline triggers.
    const schema=database();
    try {
      for (const {sql} of schema.prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid').all()) await db.prepare(sql).run();
    } finally {schema.close();}
    await db.prepare("INSERT INTO runtime_purpose VALUES(1,'localley-preview')").run();
    const execute=async sql=>{
      const results=[];
      // Generated statements end at line boundaries; JSON string values contain no literal newlines.
      for (const statement of sql.replace(/^--.*$/gm,'').split(/;\s*(?:\n|$)/).filter(s=>s.trim())) results.push(await db.prepare(statement).all());
      return results;
    };
    await execute(prepareNativeImport(feed(reviews.map(candidateFor)),now).sql);
    await execute(publicationSql(reviews[0]));
    await db.prepare('INSERT INTO spots(id,name,source_urls) VALUES(?,?,?)').bind(reviews.at(-1).id,'Collision','[]').run();
    await assert.rejects(execute(publicationSql(reviews)),/malformed JSON/);
    assert.equal((await db.prepare('SELECT count(*) n FROM spots').first()).n,2);
    await db.prepare('DELETE FROM spots WHERE id=?').bind(reviews.at(-1).id).run();
    const result=await execute(publicationSql(reviews));
    assert.deepEqual(result[0].results.map(r=>r.insertedPreviewId).sort(),reviews.slice(1).map(r=>r.id).sort());
    assert.equal((await db.prepare('SELECT count(*) n FROM spots').first()).n,5);
    const before=await db.prepare('SELECT * FROM spots ORDER BY id').all();
    const repeated=await execute(publicationSql(reviews));
    assert.equal(repeated[0].results.length,0);
    assert.deepEqual(await db.prepare('SELECT * FROM spots ORDER BY id').all().then(r=>r.results),before.results);
  } finally {await mf.dispose();rmSync(state,{recursive:true,force:true});}
});
