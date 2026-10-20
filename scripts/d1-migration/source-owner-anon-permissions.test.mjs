import test from 'node:test';import assert from 'node:assert/strict';
import { anonymousPermissionSql,anonymousPermissionCatalogSql } from './source-owner-anon-permissions.mjs';
import {publicCatalogs,publicColumns}from'./anonymous-read-regression.mjs';import{readFile}from'node:fs/promises';
test('permission operation requires an exact reviewed fingerprint and bounded relation count',()=>{
 for(const expectedCatalogMd5 of [undefined,'',"';DROP TABLE users;--",'a'.repeat(31)])assert.throws(()=>anonymousPermissionSql({expectedCatalogMd5}));
 for(const expectedRelations of [0,201,1.5,'48'])assert.throws(()=>anonymousPermissionSql({expectedCatalogMd5:'a'.repeat(32),expectedRelations}));
});
test('operation has locks, drift checks, row preservation, effective privilege checks and server preservation',()=>{
 const s=anonymousPermissionSql({expectedCatalogMd5:'a'.repeat(32)});
 for(const label of ['anon_guard_catalog_drift','anon_guard_row_change','anon_guard_server_privilege_change','anon_guard_residual_private_select','anon_guard_inherited_mutation_grant','anon_guard_inherited_select_grant','SHARE ROW EXCLUSIVE','TRUNCATE','has_any_column_privilege'])assert(s.includes(label));
 assert(s.startsWith('BEGIN;'));assert(s.endsWith('COMMIT;'));
 assert(!/\b(?:INSERT INTO|UPDATE public|DELETE FROM|TRUNCATE TABLE|DROP POLICY|ALTER POLICY|DISABLE ROW)\b/.test(s));
 assert(anonymousPermissionCatalogSql.includes('pg_auth_members'));
});
test('all public projection lists are explicit and match the actual app spot query',async()=>{
 const s=await readFile(new URL('../../lib/spots/queries.ts',import.meta.url),'utf8');
 const p=await readFile(new URL('../../lib/spots/projection.ts',import.meta.url),'utf8');
 const projection=/export const PUBLIC_SPOT_SELECT = "([^"]+)"/.exec(p)?.[1];
 assert.deepEqual(projection?.split(','),publicColumns.spots);
 assert.equal((s.match(/from\("spots"\)\.select\(PUBLIC_SPOT_SELECT\)/g)??[]).length,1);
 assert.equal((s.match(/from\("spots"\)\.select\(PUBLIC_SPOT_CARD_SELECT\)/g)??[]).length,1);
 assert(s.includes('import { PUBLIC_SPOT_SELECT, PUBLIC_SPOT_CARD_SELECT } from "./projection"'));
 const joins=/export const PUBLIC_SPOT_CARD_SELECT = `\$\{PUBLIC_SPOT_SELECT\}([^`]+)` as const;/.exec(p)?.[1];
 assert.equal(joins,',destination:geo_destinations!spots_destination_id_fk(name,slug),localArea:geo_local_areas!spots_local_area_destination_fk(name)');
 for(const column of ['name','slug'])assert(publicColumns.geo_destinations.includes(column));
 assert(publicColumns.geo_local_areas.includes('name'));
 assert(!s.includes('from("spots").select("*")'));
 assert.equal(publicCatalogs.length,9);
});

test('extension writes stay in the regression even when operator repair is limited to owned application tables',()=>{
 const owned=anonymousPermissionSql({expectedCatalogMd5:'a'.repeat(32)}),all=anonymousPermissionSql({expectedCatalogMd5:'a'.repeat(32),includeExtensionOwned:true});
 assert(owned.includes(') c WHERE NOT extension_owned'));assert(owned.includes('<>48'));
 assert(!all.includes(') c WHERE NOT extension_owned'));assert(all.includes('<>51'));
 assert.throws(()=>anonymousPermissionSql({expectedCatalogMd5:'a'.repeat(32),includeExtensionOwned:'false'}));
});
