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
  assert.equal(process.argv[2],'--out');assert.equal(process.argv.length,4);
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
    report.state='passed';
  } finally {
    if(admitted)await cleanup();report.containerRemoved=await owned()===null;
    await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  console.log(JSON.stringify({state:report.state,checks:report.checks.length,containerRemoved:report.containerRemoved}));
}
