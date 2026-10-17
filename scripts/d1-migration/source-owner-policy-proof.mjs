// Policy-field fixture proof only; no Source or external requests. Full Source schema is checked separately.
import assert from 'node:assert/strict';
import { sourceOwnerPolicySql, ownerCatalogSql, ownerTables, truncateTables } from './source-owner-policy-guard.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const image = 'postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';
const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
const key = value('--key') ?? (process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}` : `local-${randomUUID()}`);
assert(/^(?:[0-9]+-[0-9]+|local-[a-f0-9-]{36})$/.test(key), 'invalid_proof_key');
const name = `localley-source-owner-proof-${key}`;
const label = 'cyberlink.localley.source-owner-proof';
const output = value('--out');
const cleanupOnly = args.includes('--cleanup-only');
if (!cleanupOnly && !output) throw Error('usage: source-owner-policy-proof.mjs --out NEW_REPORT [--key KEY] | --cleanup-only [--key KEY]');

async function docker(argv) {
  return (await run('docker', argv, { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 })).stdout.trim();
}
async function findOwned() {
  const ids = await docker(['ps', '-aq', '--filter', `name=^/${name}$`]);
  if (!ids) return null;
  assert(!ids.includes('\n'), 'ambiguous_proof_container');
  const item = JSON.parse(await docker(['inspect', ids]))[0];
  assert.equal(item.Name, '/' + name);
  assert.equal(item.Config.Labels[label], key, 'refuse_foreign_container_cleanup');
  assert.equal(item.Config.Labels.app, 'Localley');
  return item;
}
async function removeOwned() {
  const item = await findOwned();
  if (item) await docker(['rm', '-f', item.Id]);
  assert.equal(await findOwned(), null, 'proof_container_not_removed');
}

if (cleanupOnly) {
  await removeOwned();
  console.log(JSON.stringify({ cleanup: true, key, containersRemaining: 0 }));
} else {
  const report = { state: 'pending', key, container: name, image, sourceWrites: false, checks: [] };
  const check = (condition, message) => { assert(condition, message); report.checks.push(message); };
  let admitted = false, interrupted = false, timer;
  const childAbort = new AbortController();
  const stop = () => { interrupted = true; childAbort.abort(); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const sql = text => {
    assert(!interrupted, 'proof_interrupted');
    return docker(['exec', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-U', 'postgres', '-d', 'postgres', '-c', text]);
  };
  await writeFile(output, JSON.stringify(report) + '\n', { mode: 0o600, flag: 'wx' });
  try {
    report.restrictionSha256 = createHash('sha256').update(sourceOwnerPolicySql()).digest('hex');
    const cached = JSON.parse(await docker(['image', 'inspect', image]))[0];
    check(cached.RepoDigests.includes(image), 'pinned_image_cached_no_pull');
    assert.equal(await findOwned(), null, 'proof_container_already_exists');
    admitted = true; timer = setTimeout(stop, 180000);
    report.containerId = await docker(['run', '--pull=never', '--rm', '-d', '--name', name,
      '--label', `${label}=${key}`, '--label', 'app=Localley', '--network', 'none',
      '--memory', '512m', '--cpus', '1', '--tmpfs', '/var/lib/postgresql:rw,size=256m',
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'TZ=UTC', image,
      '-c', 'shared_buffers=32MB', '-c', 'max_connections=80']);
    let ready = false;
    for (let i = 0; i < 40 && !interrupted; i++) {
      try { await docker(['exec', name, 'pg_isready', '-U', 'postgres']); ready = true; break; }
      catch { await new Promise(r => setTimeout(r, 500)); }
    }
    check(ready, 'postgres_ready');
    const container = await findOwned();
    check(container.Id === report.containerId && container.Image === cached.Id
      && container.HostConfig.NetworkMode === 'none' && Object.keys(container.HostConfig.PortBindings ?? {}).length === 0, 'owned_isolated_pinned_container');
    check(container.Mounts.every(m => m.Type !== 'volume'), 'no_persistent_volume');
    await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $jwt$ SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb $jwt$;
      CREATE TABLE users(id uuid PRIMARY KEY,clerk_id text UNIQUE NOT NULL,email text,username text,xp integer DEFAULT 0,level integer DEFAULT 1);
      CREATE TABLE challenges(id uuid PRIMARY KEY,name text);
      CREATE TABLE spots(id uuid PRIMARY KEY,name jsonb,review_count integer DEFAULT 0,average_rating numeric);
      CREATE TABLE itineraries(id uuid PRIMARY KEY,clerk_user_id text,user_id uuid REFERENCES users(id),is_public boolean DEFAULT false,shared boolean DEFAULT false,title text,like_count integer DEFAULT 0);
      CREATE TABLE conversations(id uuid PRIMARY KEY,clerk_user_id text NOT NULL,linked_itinerary_id uuid REFERENCES itineraries(id) ON DELETE SET NULL,title text);
      CREATE TABLE messages(id uuid PRIMARY KEY,conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,role text,content text);
      CREATE TABLE user_progress(user_id uuid PRIMARY KEY REFERENCES users(id),discoveries integer DEFAULT 0);
      CREATE TABLE user_challenges(user_id uuid REFERENCES users(id),challenge_id uuid REFERENCES challenges(id),completed boolean DEFAULT false,PRIMARY KEY(user_id,challenge_id));
      CREATE TABLE affiliate_clicks(id uuid PRIMARY KEY,value text);
      CREATE TABLE affiliate_earnings(id uuid PRIMARY KEY,value text);
      ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY; ALTER TABLE affiliate_earnings ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;`);
    const id = n => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    await sql(`INSERT INTO users(id,clerk_id,email,username) VALUES('${id(1)}','owner-a','private-a@preview.localley.test','Alice'),('${id(2)}','owner-b','private-b@preview.localley.test','Bob');
      INSERT INTO challenges VALUES('${id(9)}','Public challenge'); INSERT INTO spots(id,name) VALUES('${id(9)}','{"en":"Public spot"}');
      INSERT INTO itineraries(id,clerk_user_id,user_id,title) VALUES('${id(1)}','owner-a','${id(1)}','Private A'),('${id(2)}','owner-b','${id(2)}','Private B');
      INSERT INTO conversations(id,clerk_user_id,linked_itinerary_id) VALUES('${id(1)}','owner-a','${id(1)}'),('${id(2)}','owner-b','${id(2)}');
      INSERT INTO messages VALUES('${id(1)}','${id(1)}','user','Secret A'),('${id(2)}','${id(2)}','user','Secret B');
      INSERT INTO user_progress(user_id) VALUES('${id(1)}'),('${id(2)}');
      INSERT INTO user_challenges(user_id,challenge_id) VALUES('${id(1)}','${id(9)}'),('${id(2)}','${id(9)}');`);
    const catalog = () => sql(ownerCatalogSql);
    const fingerprint = () => sql(`SELECT md5(string_agg(v.h,'|' ORDER BY v.tab)) FROM (${truncateTables.map(t=>`SELECT '${t}' AS tab,md5(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY to_jsonb(x)::text),'')) AS h FROM public.${t} x`).join(' UNION ALL ')}) v`);
    const originalCatalog=await catalog(), originalRows=await fingerprint();
    const roleQuery = (role,subject,statement) => sql(`BEGIN; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claims='${JSON.stringify({sub:subject,user_metadata:{sub:'owner-b'}})}'; ${statement}; ROLLBACK;`);
    const count = async(role,subject,table,where='true') => (await roleQuery(role,subject,`SELECT count(*) FROM public.${table} WHERE ${where}`)).split('\n').find(x=>/^[0-9]+$/.test(x));
    for(const table of ownerTables.filter(t=>!['spots','challenges'].includes(t))) check(await count('anon','',table)==='2', table+'_public_exposure_reproduced');
    // A DDL trigger simulates an unexpected row write inside the guarded transaction.
    // This verifies the digest guard, rather than only checking an unchanged happy path.
    await sql(`CREATE FUNCTION fixture_policy_row_change() RETURNS event_trigger LANGUAGE plpgsql AS $fixture$
      BEGIN UPDATE public.users SET email='unexpected@preview.localley.test' WHERE clerk_id='owner-a'; END $fixture$;
      CREATE EVENT TRIGGER fixture_policy_row_change ON ddl_command_end WHEN TAG IN ('CREATE POLICY') EXECUTE FUNCTION fixture_policy_row_change();`);
    let rowChangeRefused=false;
    try { await sql(sourceOwnerPolicySql()); } catch(error) { rowChangeRefused=/owner_guard_rows_changed/.test(error.stderr??''); }
    check(rowChangeRefused,'unexpected_transaction_row_write_refused');
    check(await fingerprint()===originalRows,'unexpected_row_write_rolled_back');
    check(await catalog()===originalCatalog,'unexpected_row_write_policy_changes_rolled_back');
    await sql('DROP EVENT TRIGGER fixture_policy_row_change; DROP FUNCTION fixture_policy_row_change();');
    await sql(sourceOwnerPolicySql());const restrictedCatalog=await catalog();
    check(await fingerprint()===originalRows,'restriction_preserves_all_rows');
    for(const table of ownerTables){
      const isPublic=['spots','challenges'].includes(table);
      check(await count('anon','',table)===(isPublic?'1':'0'),table+'_anonymous_boundary');
      check(await count('authenticated','owner-a',table)==='1',table+'_owner_or_public_read');
      if(!isPublic) check(await count('authenticated','unknown-owner',table)==='0',table+'_unknown_owner_no_rows');
    }
    for(const role of ['anon','authenticated'])for(const table of truncateTables)check((await sql(`SELECT has_table_privilege('${role}','public.${table}','TRUNCATE')::int`))==='0',role+'_'+table+'_truncate_revoked');
    let expectedRows=originalRows;
    async function denied(role,subject,statement,label){let blocked=false;try{await roleQuery(role,subject,statement);}catch(error){blocked=/row-level security|permission denied/.test(error.stderr??'');}check(blocked,label);check(await fingerprint()===expectedRows,label+'_no_persistent_change');}
    await denied('anon','',`INSERT INTO users(id,clerk_id) VALUES('${id(3)}','anon')`,'anonymous_profile_insert_denied');
    await denied('authenticated','owner-a',`INSERT INTO itineraries(id,clerk_user_id) VALUES('${id(3)}','owner-b')`,'foreign_itinerary_insert_denied');
    await denied('authenticated','owner-a',`UPDATE users SET clerk_id='owner-c' WHERE id='${id(1)}'`,'profile_owner_reassignment_denied');
    await denied('authenticated','owner-a',`UPDATE itineraries SET user_id='${id(2)}' WHERE id='${id(1)}'`,'foreign_user_link_denied');
    await denied('authenticated','owner-a',`UPDATE conversations SET linked_itinerary_id='${id(2)}' WHERE id='${id(1)}'`,'foreign_trip_link_denied');
    await denied('authenticated','owner-a',`UPDATE messages SET conversation_id='${id(2)}' WHERE id='${id(1)}'`,'foreign_conversation_reparent_denied');
    await denied('authenticated','owner-a',`UPDATE user_progress SET user_id='${id(2)}' WHERE user_id='${id(1)}'`,'foreign_progress_link_denied');
    await denied('authenticated','owner-a',`UPDATE user_challenges SET user_id='${id(2)}' WHERE user_id='${id(1)}'`,'foreign_challenge_link_denied');
    for(const role of ['anon','authenticated']){
      await denied(role,'owner-a',`INSERT INTO spots(id) VALUES('${id(3)}')`,role+'_public_spot_insert_denied');
      await denied(role,'owner-a','TRUNCATE messages',role+'_real_truncate_denied');
      await roleQuery(role,'owner-a',`UPDATE public.spots SET review_count=999; DELETE FROM public.challenges`);
      check(await fingerprint()===originalRows,role+'_public_writes_have_no_effect');
    }
    for(const table of ['users','itineraries','conversations','messages']){
      const set=table==='users'?"username='Changed'":table==='messages'?"content='Changed'":"title='Changed'";
      const response=await roleQuery('authenticated','owner-a',`UPDATE public.${table} SET ${set}; DELETE FROM public.${table} WHERE id='${id(2)}'`);
      check(response.includes('UPDATE 1')&&response.includes('DELETE 0'),table+'_owned_update_and_foreign_delete_boundary');
    }
    await sql(`UPDATE public.itineraries SET is_public=true WHERE id='${id(2)}'`);
    check(await count('authenticated','owner-a','itineraries')==='2','authenticated_published_trip_read_retained');
    check(await count('anon','','itineraries')==='0','anonymous_cannot_enumerate_trip_share_codes');
    expectedRows=await fingerprint();
    check((await roleQuery('authenticated','owner-a',`UPDATE itineraries SET title='Foreign overwrite' WHERE id='${id(2)}'`)).includes('UPDATE 0')&&await fingerprint()===expectedRows,'published_foreign_update_denied');
    await sql(`UPDATE public.itineraries SET is_public=false WHERE id='${id(2)}'`);
    expectedRows=originalRows;
    const service=await roleQuery('service_role','',`UPDATE public.spots SET review_count=7; UPDATE public.itineraries SET like_count=7; SELECT count(*) FROM users`);
    check(service.includes('UPDATE 1')&&service.includes('UPDATE 2'),'server_counters_and_all_owner_reads_retained');
    check(await fingerprint()===originalRows,'all_test_changes_rolled_back');
    let refused=false;try{await sql(sourceOwnerPolicySql());}catch{refused=true;}check(refused&&await catalog()===restrictedCatalog,'repeat_refused_without_partial_change');
    refused=false;try{await sql(sourceOwnerPolicySql({restoreCatalogMd5:'0'.repeat(32)}));}catch{refused=true;}check(refused&&await catalog()===restrictedCatalog,'wrong_rollback_fingerprint_refused');
    await sql(sourceOwnerPolicySql({restoreCatalogMd5:restrictedCatalog}));
    check(await catalog()===originalCatalog&&await fingerprint()===originalRows,'exact_local_rollback_catalog_acl_rows');
    await sql('CREATE POLICY unexpected ON users FOR SELECT USING(true)');const drifted=await catalog();refused=false;
    try{await sql(sourceOwnerPolicySql());}catch{refused=true;}check(refused&&await catalog()===drifted,'unexpected_policy_refused_atomically');
    await sql('DROP POLICY unexpected ON users');
    await sql(`UPDATE public.itineraries SET clerk_user_id=NULL WHERE id='${id(1)}'`);refused=false;
    try{await sql(sourceOwnerPolicySql());}catch{refused=true;}check(refused,'missing_historical_owner_refused');
    await sql(`UPDATE public.itineraries SET clerk_user_id='owner-a' WHERE id='${id(1)}'`);
    await sql(sourceOwnerPolicySql());check(await catalog()===restrictedCatalog&&await fingerprint()===originalRows,'reapply_after_rollback_exact');
    // Extend only the disposable policy-field fixture for actual handler integration.
    await sql(`ALTER TABLE itineraries ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE itineraries ADD COLUMN subtitle text, ADD COLUMN city text, ADD COLUMN days integer, ADD COLUMN activities jsonb DEFAULT '[]',
        ADD COLUMN local_score numeric, ADD COLUMN highlights text[], ADD COLUMN estimated_cost text, ADD COLUMN status text DEFAULT 'draft', ADD COLUMN is_favorite boolean DEFAULT false;
      CREATE TABLE saved_itineraries(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,clerk_user_id text,itinerary_id uuid REFERENCES itineraries(id),UNIQUE(clerk_user_id,itinerary_id));
      CREATE TABLE spot_reviews(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,spot_id uuid REFERENCES spots(id),clerk_user_id text,rating integer,comment text,visit_date date,updated_at timestamptz,created_at timestamptz DEFAULT now());
      ALTER TABLE saved_itineraries ENABLE ROW LEVEL SECURITY; ALTER TABLE spot_reviews ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON saved_itineraries,spot_reviews TO authenticated,service_role;
      CREATE POLICY own_saved ON saved_itineraries FOR ALL TO authenticated USING(clerk_user_id=auth.jwt()->>'sub') WITH CHECK(clerk_user_id=auth.jwt()->>'sub');
      CREATE POLICY public_reviews ON spot_reviews FOR SELECT TO authenticated USING(true);
      CREATE POLICY own_review_insert ON spot_reviews FOR INSERT TO authenticated WITH CHECK(clerk_user_id=auth.jwt()->>'sub');`);
    const integration = await run(resolve(process.cwd(),'node_modules/.bin/vitest'),['run','__tests__/api/source-owner-postgres.test.ts','--maxWorkers=1'],{
      cwd: process.cwd(), encoding:'utf8',timeout:90000,maxBuffer:1024*1024,signal:childAbort.signal,
      env:{...process.env,LOCALLEY_SOURCE_OWNER_PROOF_KEY:key},
    });
    check(/4 passed/.test(integration.stdout),'four_actual_handler_postgres_integration_tests');
    assert(!interrupted, 'proof_interrupted'); report.state = 'passed';
  } catch (error) {
    report.state = 'failed'; report.error = error.message;
  } finally {
    clearTimeout(timer);
    if (admitted) {
      try { await removeOwned(); report.checks.push('owned_container_removed'); }
      catch (error) { report.state = 'failed'; report.cleanupError = error.message; }
    }
    if (interrupted) report.state = 'failed';
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }
  console.log(JSON.stringify({ state: report.state, checks: report.checks.length, error: report.error, cleanupError: report.cleanupError }));
  if (report.state !== 'passed') process.exitCode = 1;
}
