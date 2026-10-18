import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRscProbeUrl } from './rsc-probe-url.mjs';
const marker='12345678~1234~5678~9abc~123456789abc';
const literal=`https://www.localley.io/dashboard?transportCanary=${marker}&_rsc=next-307`;
const encoded=literal.replaceAll('~','%7E');
test('Next307 literal tildes normalize to the encoded provider lookup representation',()=>{
 assert.notEqual(literal,encoded);assert.equal(normalizeRscProbeUrl(literal),encoded);
 assert.equal(new URL(normalizeRscProbeUrl(literal)).searchParams.get('transportCanary'),marker);
 assert.equal(new URL(normalizeRscProbeUrl(literal)).searchParams.get('_rsc'),'next-307');
});
test('encoded probes remain stable and normalization is idempotent',()=>{
 assert.equal(normalizeRscProbeUrl(encoded),encoded);
 assert.equal(normalizeRscProbeUrl(normalizeRscProbeUrl(literal)),encoded);
 assert.equal(normalizeRscProbeUrl(encoded.replaceAll('%7E','%7e')),encoded);
});
test('query order stays intact and the RSC token is not changed',()=>{
 const reversed=`https://www.localley.io/dashboard?_rsc=one_two-3&transportCanary=${marker}`;
 assert.equal(normalizeRscProbeUrl(reversed),reversed.replaceAll('~','%7E'));
});
test('foreign origins, paths, credentials and non-probe queries fail without private text',()=>{
 const bad=[null,{},new URL(literal),'PRIVATEBYTES',literal.replace('https:','http:'),literal.replace('www.localley.io','evil.test'),literal.replace('www.localley.io','www.localley.io.evil.test'),literal.replace('www.localley.io','PRIVATEBYTES@www.localley.io'),literal.replace('/dashboard','/settings'),literal+'#PRIVATEBYTES',literal+'&extra=PRIVATEBYTES',literal+'&_rsc=other',literal+'&transportCanary='+marker,literal.replace(marker,'PRIVATEBYTES'),literal.replace('next-307','x'.repeat(65)),literal.replace('next-307','bad%20token'),literal.replace('&_rsc=next-307','')];
 for(const input of bad)assert.throws(()=>normalizeRscProbeUrl(input),error=>error.message==='Invalid retained RSC probe'&&!error.message.includes('PRIVATEBYTES'));
});
test('double-encoded markers remain invalid instead of changing probe identity',()=>{
 assert.throws(()=>normalizeRscProbeUrl(encoded.replaceAll('%7E','%257E')),/Invalid retained RSC probe/);
 assert.equal(literal.includes('%7E'),false);assert.equal(encoded.includes('~'),false);
});

test('actual Next redirect may retain a present empty RSC token',()=>{
 const empty=literal.replace('next-307','');const normalized=normalizeRscProbeUrl(empty);
 assert.equal(normalized,empty.replaceAll('~','%7E'));
 assert.equal(new URL(normalized).searchParams.has('_rsc'),true);
 assert.equal(new URL(normalized).searchParams.get('_rsc'),'');
});
