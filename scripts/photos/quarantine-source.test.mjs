import assert from 'node:assert/strict';
import test from 'node:test';
import {repairFilters,targetId,validateSnapshot,sourceFields} from './quarantine-source.mjs';
const row={id:targetId,name:{en:'Daesin-dong Old Town',ko:'대신동 구시가'},google_place_id:null,location:'0101000020E61000003FC6DCB584BC5F404694F6065FC84240',photos:['a','b','c'].map(x=>'/api/places/photo?name=places%2FChIJTwlXpoSifDURJOCAoUd4JoM%2Fphotos%2F'+x+'&w=1200')};
test('CAS scopes one known row, exact geography, name, NULL listing and TEXT[] original photos',()=>{const f=repairFilters(row);assert.equal(f.id,'eq.'+targetId);assert.equal(f.google_place_id,'is.null');assert.equal(f.location,'eq.'+row.location);assert.ok(f.photos.startsWith('eq.{"'));assert.ok(!f.photos.startsWith('eq.['));assert.equal(f.name,'eq.'+JSON.stringify(row.name));});
test('rollback only matches empty photos and the unchanged source identity',()=>{const f=repairFilters(row,true);assert.equal(f.photos,'eq.{}');assert.equal(f.id,'eq.'+targetId);assert.equal(f.location,'eq.'+row.location);});
test('refuses another owner, listing, renamed venue, unproven photo or changed point',()=>{for(const change of [{id:'other'},{name:{en:'Another venue'}},{google_place_id:'other'},{photos:['https://example.com/image']},{location:'POINT(0 0)'}])assert.throws(()=>validateSnapshot({...row,...change}));});

test('preservation check detects nested source changes while allowing photos only',()=>{assert.equal(sourceFields(row),sourceFields({...row,photos:[]}));assert.notEqual(sourceFields(row),sourceFields({...row,name:{...row.name,ko:'changed'}}));assert.notEqual(sourceFields({...row,tips:{en:'original'}}),sourceFields({...row,tips:{en:'changed'}}));});
