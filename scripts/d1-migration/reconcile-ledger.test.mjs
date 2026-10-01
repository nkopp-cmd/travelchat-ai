import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { reconcileLedger, CANDIDATE } from './reconcile-ledger.mjs';
const sha = 'a'.repeat(64);
function setup() {
 const db = new DatabaseSync(':memory:');
 db.exec('CREATE TABLE item(id TEXT PRIMARY KEY NOT NULL); CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
 const actual = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const expected = { schema: actual.filter(r => r.name === 'item'), migrations: [{ name:'0014_test.sql',sha256:sha },{ name:'0015_test.sql',sha256:sha }] };
 return { db, evidence:{ databaseId:CANDIDATE,expected,actual,ledger:[],foreignKeys:[] } };
}
test('registers without DDL and repeats with zero changes',()=>{
 const {db,evidence}=setup();try{const r=reconcileLedger(evidence); const before = JSON.stringify(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all());db.exec(r.sql);assert.equal(JSON.stringify(db.prepare('SELECT name,sql FROM sqlite_master ORDER BY name').all()),before);assert.equal(db.prepare('SELECT count(*) n FROM d1_migrations').get().n,2);db.exec(r.sql);assert.equal(db.prepare('SELECT changes() n').get().n,0);}finally{db.close();}
});
test('rejects wrong target, FK errors, schema drift and unreviewed objects',()=>{
 const {db,evidence}=setup();try{
 for(const patch of [{databaseId:'production'},{foreignKeys:[{}]},{actual:[]},{actual:[...evidence.actual,{name:'unexpected',type:'table',sql:'CREATE TABLE unexpected(id)'}]}])assert.throws(()=>reconcileLedger({...evidence,...patch}));
 assert.throws(()=>reconcileLedger({...evidence,expected:{...evidence.expected,schema:[{name:'item',type:'table',sql:'CREATE TABLE item(id INTEGER)'}]}}),/Schema mismatch/);
 }finally{db.close();}
});
test('rejects unknown or duplicate ledger names',()=>{
 const {db,evidence}=setup();try{assert.throws(()=>reconcileLedger({...evidence,ledger:[{name:'9999_other.sql'}]}));assert.throws(()=>reconcileLedger({...evidence,ledger:[{name:'0014_test.sql'},{name:'0014_test.sql'}]}));}finally{db.close();}
});
test('stale schema or ledger preflight inserts nothing',()=>{
 for(const mutation of ['ALTER TABLE item ADD COLUMN value TEXT',"INSERT INTO d1_migrations(name) VALUES ('9999_other.sql')"]){const {db,evidence}=setup();try{const {sql}=reconcileLedger(evidence);db.exec(mutation);db.exec(sql);assert.equal(db.prepare('SELECT changes() n').get().n,0);}finally{db.close();}}
});

test('accepts only the exact D1 internal KV definition',()=>{
 const {db,evidence}=setup();try{
 const internal={name:'_cf_KV',type:'table',sql:'CREATE TABLE _cf_KV (key TEXT PRIMARY KEY,value BLOB) WITHOUT ROWID'};
 assert.doesNotThrow(()=>reconcileLedger({...evidence,actual:[...evidence.actual,internal]}));
 assert.throws(()=>reconcileLedger({...evidence,actual:[...evidence.actual,{...internal,sql:'CREATE TABLE _cf_KV(key TEXT)'}]}),/internal/);
 }finally{db.close();}
});
