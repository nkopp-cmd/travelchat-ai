// Real PostgreSQL semantics proof. Disposable rows only; no network or production credentials.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { anonymousCatalogSql, publicColumns } from './anonymous-read-regression.mjs';
const run = promisify(execFile);
const image = 'postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';
const key = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}` : `local-${randomUUID()}`;
assert(/^(?:[0-9]+-[0-9]+|local-[a-f0-9-]{36})$/.test(key));
const name = `localley-anon-access-proof-${key}`, label = 'cyberlink.localley.anon-access-proof';
const docker = async args => (await run('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1048576})).stdout.trim();
async function owned() {
  const ids=await docker(['ps','-aq','--filter',`name=^/${name}$`]);if(!ids)return null;
  assert(!ids.includes('\n'));const item=JSON.parse(await docker(['inspect',ids]))[0];
  assert.equal(item.Name,'/'+name);assert.equal(item.Config.Labels[label],key);assert.equal(item.Config.Labels.app,'Localley');return item;
}
async function cleanup(){const item=await owned();if(item)await docker(['rm','-f',item.Id]);assert.equal(await owned(),null);}
if(process.argv.includes('--cleanup-only')){await cleanup();console.log('Anonymous proof container absent.');}
else {
  assert.equal(process.argv[2],'--out');assert.equal(process.argv.length,process.argv.includes('--permissions')?5:4);
  const report={state:'pending',image,checks:[],productionWrites:false};
  await writeFile(process.argv[3],JSON.stringify(report),{mode:0o600,flag:'wx'});
  let admitted=false;
  const sql=async query=>docker(['exec',name,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U','postgres','-c',query]);
  const check=(v,label)=>{assert(v,label);report.checks.push(label);};
  const catalog=async table=>JSON.parse(await sql(`SELECT row_to_json(q) FROM (${anonymousCatalogSql}) q WHERE name='${table}'`));
  async function denied(statement,label){
    let blocked=false;try{await sql(`BEGIN;SET LOCAL ROLE anon;${statement};ROLLBACK;`);}catch(e){blocked=/permission denied|row-level security/.test(e.stderr??'');}
    check(blocked,label);
  }
  try {
    check(JSON.parse(await docker(['image','inspect',image]))[0].RepoDigests.includes(image),'pinned_image_cached');
    assert.equal(await owned(),null);admitted=true;
    await docker(['run','--pull=never','--rm','-d','--name',name,'--label',`${label}=${key}`,'--label','app=Localley','--network','none','--memory','512m','--cpus','1','--tmpfs','/var/lib/postgresql:rw,size=256m','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);
    let ready=false;for(let i=0;i<40;i++){try{await docker(['exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}check(ready,'postgres_ready');
    const item=await owned();check(item.HostConfig.NetworkMode==='none'&&Object.keys(item.HostConfig.PortBindings??{}).length===0&&item.Mounts.every(m=>m.Type!=='volume'),'isolated_no_ports_or_volume');
    await sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      CREATE TABLE users(id integer PRIMARY KEY,email text);INSERT INTO users VALUES(1,'fixture@localley.test');
      CREATE TABLE spots(id integer PRIMARY KEY,name text,discovered_by text);INSERT INTO spots VALUES(1,'Public fixture','private-owner');
      GRANT ALL ON users,spots TO anon,authenticated,service_role;
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;ALTER TABLE spots ENABLE ROW LEVEL SECURITY;
      CREATE POLICY owners ON users TO authenticated USING(true) WITH CHECK(true);
      CREATE POLICY catalog ON spots FOR SELECT TO anon USING(true);`);
    for(const table of ['users','spots']){
      const c=await catalog(table);check(c.anon_insert_blocked&&c.anon_update_blocked&&c.anon_delete_blocked,table+'_no_anonymous_dml_policy');
      await denied(`INSERT INTO ${table}(id) VALUES(2)`,table+'_valid_insert_denied');
      const result=await sql(`BEGIN;SET LOCAL ROLE anon;UPDATE ${table} SET id=3 WHERE id=1;DELETE FROM ${table} WHERE id=1;ROLLBACK;`);
      check(result.includes('UPDATE 0')&&result.includes('DELETE 0'),table+'_existing_row_update_delete_zero');
    }
    check((await sql('BEGIN;SET LOCAL ROLE anon;SELECT count(*) FROM users;SELECT count(*) FROM spots;ROLLBACK;')).includes('0\n1'),'private_zero_public_visible');
    check((await catalog('spots')).anon_select_columns.includes('discovered_by')&&!publicColumns.spots.includes('discovered_by'),'real_owner_column_exposure_detected');
    await sql('REVOKE SELECT ON spots FROM anon;GRANT SELECT(id,name) ON spots TO anon;');
    check(JSON.stringify((await catalog('spots')).anon_select_columns)===JSON.stringify(['id','name']),'column_grant_projection_exact');
    await denied('SELECT discovered_by FROM spots','private_column_select_denied');
    await sql(`CREATE POLICY open_insert ON users FOR INSERT TO PUBLIC WITH CHECK(true);
      CREATE POLICY open_update ON users FOR UPDATE TO PUBLIC USING(true);
      CREATE POLICY open_delete ON users FOR DELETE TO PUBLIC USING(true);`);
    let c=await catalog('users');check(!c.anon_insert_blocked&&!c.anon_update_blocked&&!c.anon_delete_blocked,'public_policy_write_risk_detected_on_empty_or_hidden_table');
    check((await sql("BEGIN;SET LOCAL ROLE anon;INSERT INTO users VALUES(2,'attacker@localley.test');ROLLBACK;")).includes('INSERT 0 1'),'actual_public_policy_insert_reproduced');
    await sql('CREATE POLICY open_read ON users FOR SELECT TO PUBLIC USING(true);');
    const open=await sql("BEGIN;SET LOCAL ROLE anon;UPDATE users SET email='changed' WHERE id=1;DELETE FROM users WHERE id=1;ROLLBACK;");
    check(open.includes('UPDATE 1')&&open.includes('DELETE 1'),'actual_existing_row_public_update_delete_reproduced');
    await sql('REVOKE INSERT,UPDATE,DELETE ON users FROM anon;');
    c=await catalog('users');check(c.anon_insert_blocked&&c.anon_update_blocked&&c.anon_delete_blocked,'revoked_privileges_block_even_public_policies');
    for(const statement of ["INSERT INTO users VALUES(2,'fixture')","UPDATE users SET email='changed' WHERE id=1","DELETE FROM users WHERE id=1"])await denied(statement,'real_dml_acl_denial_'+statement.split(' ')[0]);
    await sql('GRANT INSERT(email),UPDATE(email) ON users TO anon;');
    c=await catalog('users');check(!c.anon_insert_blocked&&!c.anon_update_blocked&&c.anon_delete_blocked,'column_only_mutation_grants_detected');
    await sql('REVOKE INSERT(email),UPDATE(email) ON users FROM anon;CREATE ROLE write_group;GRANT write_group TO anon;GRANT INSERT ON users TO write_group;');
    check(!(await catalog('users')).anon_insert_blocked,'inherited_write_grant_detected');
    await sql('REVOKE INSERT ON users FROM write_group;GRANT DELETE ON users TO PUBLIC;');
    check(!(await catalog('users')).anon_delete_blocked,'public_inherited_grant_detected');
    await sql(`REVOKE DELETE ON users FROM PUBLIC;GRANT ALL ON users TO anon;
      DROP POLICY open_insert ON users;DROP POLICY open_update ON users;DROP POLICY open_delete ON users;
      CREATE POLICY false_writes ON users TO anon USING(false) WITH CHECK(false);`);
    c=await catalog('users');check(c.anon_insert_blocked&&c.anon_update_blocked&&c.anon_delete_blocked,'literal_false_policies_prove_denial');
    await sql('ALTER TABLE users DISABLE ROW LEVEL SECURITY;');
    check(!(await catalog('users')).anon_insert_blocked,'disabled_rls_cannot_prove_denial');
    await sql('ALTER TABLE users ENABLE ROW LEVEL SECURITY;ALTER ROLE anon BYPASSRLS;');
    check(!(await catalog('users')).anon_insert_blocked,'bypass_role_cannot_prove_denial');
    await sql('ALTER ROLE anon NOBYPASSRLS;ALTER TABLE users OWNER TO anon;');
    check(!(await catalog('users')).anon_insert_blocked,'relation_owner_cannot_prove_denial');
    await sql('ALTER TABLE users OWNER TO postgres;');
    check((await sql("SELECT count(*) FROM users WHERE id=1 AND email='fixture@localley.test'")).trim()==='1','fixture_mutations_rolled_back');
    check((await sql("BEGIN;SET LOCAL ROLE service_role;UPDATE users SET email='server' WHERE id=1;ROLLBACK;")).includes('UPDATE 1'),'server_writes_preserved');
    if(process.argv.includes('--permissions')) {
      const {anonymousPermissionSql,anonymousPermissionCatalogSql}=await import('./source-owner-anon-permissions.mjs');
      for(const [table,columns] of Object.entries(publicColumns)){
        if(table==='spots'){
          for(const column of columns.filter(c=>!['id','name'].includes(c)))await sql(`ALTER TABLE spots ADD COLUMN ${column} text`);
        }else{
          await sql(`CREATE TABLE ${table}(${columns.map(c=>c+' text').join(',')});ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;CREATE POLICY public_catalog ON ${table} FOR SELECT TO anon USING(true)`);
        }
        if(['geo_countries','geo_destinations','geo_local_areas','transfer_edges'].includes(table))await sql(`ALTER TABLE ${table} ADD COLUMN source_meta jsonb`);
      }
      await sql(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;DROP POLICY open_read ON users;
        CREATE POLICY potentially_public_private_read ON users FOR SELECT TO anon USING(true);
        CREATE POLICY possible_insert ON users FOR INSERT TO anon WITH CHECK(true);
        CREATE POLICY possible_update ON users FOR UPDATE TO anon USING(true);
        CREATE POLICY possible_delete ON users FOR DELETE TO anon USING(true);`);
      await sql(`CREATE TABLE extension_reference(id integer PRIMARY KEY,note text);INSERT INTO extension_reference VALUES(1,'public reference');
        CREATE VIEW extension_reference_view AS SELECT id,note FROM extension_reference;
        GRANT ALL ON extension_reference,extension_reference_view TO anon,authenticated,service_role;
        INSERT INTO pg_catalog.pg_depend(classid,objid,objsubid,refclassid,refobjid,refobjsubid,deptype)
        SELECT 'pg_class'::regclass,c.oid,0,'pg_extension'::regclass,e.oid,0,'e' FROM pg_class c CROSS JOIN pg_extension e
        WHERE c.relname IN('extension_reference','extension_reference_view') AND c.relnamespace='public'::regnamespace AND e.extname='plpgsql'`);
      const fingerprint=async()=>JSON.parse(await sql(`SELECT row_to_json(q) FROM (${anonymousPermissionCatalogSql}) q`)).catalog_md5;
      const original=await fingerprint();const operation=anonymousPermissionSql({expectedCatalogMd5:original,expectedRelations:12,includeExtensionOwned:true});
      const appOperation=anonymousPermissionSql({expectedCatalogMd5:original,expectedRelations:10});
      const appOutput=await sql(appOperation.replace(/COMMIT;$/,`SELECT row_to_json(q) FROM (${anonymousCatalogSql}) q WHERE name='users';ROLLBACK;`));
      const appState=JSON.parse(appOutput.split('\n').find(line=>line.startsWith('{')));
      check(appState.anon_insert_blocked&&appState.anon_update_blocked&&appState.anon_delete_blocked,'owned_application_scope_denies_app_writes');
      check(appState.anon_select_blocked&&!appState.anon_table_select&&!appState.anon_column_select,'owned_scope_private_reads_denied_despite_permissive_policy');
      check(appState.extension_mutations.length===2&&appState.extension_mutations.every(e=>!e.insertBlocked&&!e.updateBlocked&&!e.deleteBlocked),'owned_scope_keeps_residual_reference_grants_visible');
      check(await fingerprint()===original,'owned_scope_rollback_exact_catalog');

      await sql(operation.replace(/COMMIT;$/,'ROLLBACK;'));
      check(await fingerprint()===original,'permission_transaction_rollback_preserves_exact_catalog');
      let drift=false;try{await sql(anonymousPermissionSql({expectedCatalogMd5:'0'.repeat(32),expectedRelations:12,includeExtensionOwned:true}));}catch(e){drift=/anon_guard_catalog_drift/.test(e.stderr??'');}
      check(drift&&await fingerprint()===original,'permission_wrong_fingerprint_refused_atomically');
      // A PUBLIC inherited grant cannot be removed by revoking only anon; the entire operation must roll back.
      await sql('GRANT INSERT ON users TO PUBLIC');const inherited=await fingerprint();let refused=false;
      try{await sql(anonymousPermissionSql({expectedCatalogMd5:inherited,expectedRelations:12,includeExtensionOwned:true}));}catch(e){refused=/anon_guard_inherited_mutation_grant/.test(e.stderr??'');}
      check(refused&&await fingerprint()===inherited,'permission_inherited_grant_refused_atomically');await sql('REVOKE INSERT ON users FROM PUBLIC');
      const exact=await fingerprint();await sql(anonymousPermissionSql({expectedCatalogMd5:exact,expectedRelations:12,includeExtensionOwned:true}));
      const restricted=await fingerprint();check(restricted!==exact,'permission_operation_changes_only_reviewed_metadata');
      for(const table of ['users',...Object.keys(publicColumns)]){
        const c=await catalog(table);check(c.anon_insert_blocked&&c.anon_update_blocked&&c.anon_delete_blocked,table+'_permission_dml_proof');
        const column=table==='users'?'id':publicColumns[table][0];const literal=table==='users'||table==='spots'?'2':"'fixture'";
        for(const [command,statement]of [['INSERT',`INSERT INTO ${table}(${column}) VALUES(${literal})`],['UPDATE',`UPDATE ${table} SET ${column}=${column}`],['DELETE',`DELETE FROM ${table}`],['TRUNCATE',`TRUNCATE ${table}`]])await denied(statement,table+'_permission_real_'+command+'_denial');
        if(table!=='users')check(JSON.stringify(c.anon_select_columns)===JSON.stringify(publicColumns[table]),table+'_permission_public_projection');
      }
      for(const table of ['extension_reference','extension_reference_view']){
        const row=await catalog('users');const ext=row.extension_mutations.find(e=>e.table===table);
        check(ext?.insertBlocked&&ext.updateBlocked&&ext.deleteBlocked,table+'_extension_mutation_coverage');
        for(const [cmd,statement]of [['INSERT',`INSERT INTO ${table}(id) VALUES(2)`],['UPDATE',`UPDATE ${table} SET note='changed' WHERE id=1`],['DELETE',`DELETE FROM ${table} WHERE id=1`]])await denied(statement,table+'_actual_'+cmd+'_denial');
        check((await sql(`BEGIN;SET LOCAL ROLE anon;SELECT count(id) FROM ${table};ROLLBACK;`)).includes('1'),table+'_reference_reads_preserved');
      }
      await denied('SELECT discovered_by FROM spots' ,'permission_live_shape_private_owner_column_denied');
      const visible=await sql('BEGIN;SET LOCAL ROLE anon;SELECT count(id) FROM spots;ROLLBACK;');check(visible.includes('1'),'permission_public_catalog_retained');
      await denied('SELECT count(*) FROM users','permission_private_count_denied_even_with_permissive_policy');
      await denied('SELECT email FROM users','permission_private_column_denied_even_with_permissive_policy');
      check((await sql("SELECT count(*) FROM users WHERE id=1 AND email='fixture@localley.test'")).trim()==='1','permission_all_fixture_rows_preserved');
      check((await sql("BEGIN;SET LOCAL ROLE service_role;UPDATE users SET email='server' WHERE id=1;ROLLBACK;")).includes('UPDATE 1'),'permission_service_writes_retained');
      let repeated=false;try{await sql(anonymousPermissionSql({expectedCatalogMd5:exact,expectedRelations:12,includeExtensionOwned:true}));}catch(e){repeated=/anon_guard_catalog_drift/.test(e.stderr??'');}
      check(repeated&&await fingerprint()===restricted,'permission_stale_repeat_refused_without_changes');
    }
    report.state='passed';
  } finally {
    if(admitted)await cleanup();report.containerRemoved=await owned()===null;
    await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  console.log(JSON.stringify({state:report.state,checks:report.checks.length,containerRemoved:report.containerRemoved}));
}
