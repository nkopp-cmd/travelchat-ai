import test from 'node:test';import assert from 'node:assert/strict';
import { anonymousPermissionSql,anonymousPermissionCatalogSql } from './source-owner-anon-permissions.mjs';
import {publicCatalogs,publicColumns}from'./anonymous-read-regression.mjs';import{readFile}from'node:fs/promises';
test('permission operation requires an exact reviewed fingerprint and bounded relation count',()=>{
 for(const expectedCatalogMd5 of [undefined,'',"';DROP TABLE users;--",'a'.repeat(31)])assert.throws(()=>anonymousPermissionSql({expectedCatalogMd5}));
 for(const expectedRelations of [0,201,1.5,'48'])assert.throws(()=>anonymousPermissionSql({expectedCatalogMd5:'a'.repeat(32),expectedRelations}));
});
test('operation has locks, drift checks, row preservation, effective privilege checks and server preservation',()=>{
 const s=anonymousPermissionSql({expectedCatalogMd5:'a'.repeat(32)});
 for(const label of ['anon_guard_catalog_drift','anon_guard_row_change','anon_guard_server_privilege_change','anon_guard_inherited_mutation_grant','anon_guard_inherited_select_grant','SHARE ROW EXCLUSIVE','TRUNCATE','has_any_column_privilege'])assert(s.includes(label));
 assert(s.startsWith('BEGIN;'));assert(s.endsWith('COMMIT;'));
 assert(!/\b(?:INSERT INTO|UPDATE public|DELETE FROM|TRUNCATE TABLE|DROP POLICY|ALTER POLICY|DISABLE ROW)\b/.test(s));
 assert(anonymousPermissionCatalogSql.includes('pg_auth_members'));
});
test('all public projection lists are explicit and match the actual app spot query',async()=>{
 const s=await readFile(new URL('../../lib/spots/queries.ts',import.meta.url),'utf8');
 const projection=/export const PUBLIC_SPOT_SELECT = "([^"]+)"/.exec(s)?.[1];
 assert.deepEqual(projection?.split(','),publicColumns.spots);
 assert.equal((s.match(/from\("spots"\)\.select\(PUBLIC_SPOT_SELECT\)/g)??[]).length,2);
 assert(!s.includes('from("spots").select("*")'));
 assert.equal(publicCatalogs.length,9);
});
