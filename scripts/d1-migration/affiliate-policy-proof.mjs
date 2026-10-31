// Offline affiliate RLS proof. Synthetic records only; no Source or partner requests.
import assert from 'node:assert/strict';
import { affiliatePolicySql } from './affiliate-policy-guard.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const image = 'postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336';
const args = process.argv.slice(2);
const value = flag => { const i = args.indexOf(flag); return i < 0 ? null : args[i + 1]; };
const key = value('--key') ?? (process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}` : `local-${randomUUID()}`);
assert(/^(?:[0-9]+-[0-9]+|local-[a-f0-9-]{36})$/.test(key), 'invalid_proof_key');
const name = `localley-affiliate-policy-proof-${key}`;
const label = 'cyberlink.localley.affiliate-policy-proof';
const output = value('--out');
const cleanupOnly = args.includes('--cleanup-only');
if (!cleanupOnly && !output) throw Error('usage: affiliate-policy-proof.mjs --out NEW_REPORT [--key KEY] | --cleanup-only [--key KEY]');

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
  const stop = () => { interrupted = true; };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const sql = text => {
    assert(!interrupted, 'proof_interrupted');
    return docker(['exec', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-U', 'postgres', '-d', 'postgres', '-c', text]);
  };
  await writeFile(output, JSON.stringify(report) + '\n', { mode: 0o600, flag: 'wx' });
  try {
    const schema = await readFile(resolve(root, 'supabase/subscriptions-schema.sql'), 'utf8');
    report.restrictionSha256 = createHash('sha256').update(affiliatePolicySql()).digest('hex');
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
    for (let i = 0; i < 120 && !interrupted; i++) {
      try { await docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break; }
      catch { await new Promise(r => setTimeout(r, 500)); }
    }
    check(ready, 'postgres_ready');
    const container = await findOwned();
    check(container.Id === report.containerId && container.Image === cached.Id
      && container.HostConfig.NetworkMode === 'none' && Object.keys(container.HostConfig.PortBindings ?? {}).length === 0, 'owned_isolated_pinned_container');
    check(container.Mounts.every(m => m.Type !== 'volume'), 'no_persistent_volume');
    await sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');
    for (const table of ['affiliate_clicks','affiliate_earnings']) {
      const ddl = schema.match(new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${table} \([\s\S]*?\n\);`))?.[0];
      check(ddl, table+'_schema_found'); await sql(ddl);
      await sql(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO anon,authenticated,service_role;`);
    }
    await sql(`CREATE POLICY "Allow affiliate click inserts" ON public.affiliate_clicks FOR INSERT WITH CHECK(true);
      CREATE POLICY "Allow affiliate click reads" ON public.affiliate_clicks FOR SELECT USING(true);
      CREATE POLICY "Allow earnings access" ON public.affiliate_earnings FOR ALL USING(true);
      CREATE POLICY "Admin only for earnings" ON public.affiliate_earnings FOR ALL USING(false);
      INSERT INTO public.affiliate_clicks(clerk_user_id,partner,tracking_id,event_type) VALUES('synthetic','viator','fixture','click');
      INSERT INTO public.affiliate_earnings(partner,period_date) VALUES('viator',CURRENT_DATE);`);
    const fingerprint = () => sql(`SELECT md5((SELECT string_agg(to_jsonb(c)::text,'' ORDER BY id) FROM public.affiliate_clicks c)||'|'||
      (SELECT string_agg(to_jsonb(e)::text,'' ORDER BY id) FROM public.affiliate_earnings e));`);
    const initial = await fingerprint();
    const policies = () => sql(`SELECT string_agg(polname||':'||polroles::text||':'||polcmd::text||':'||polpermissive::text||':'||
      COALESCE(pg_get_expr(polqual,polrelid),'')||':'||COALESCE(pg_get_expr(polwithcheck,polrelid),''),'|' ORDER BY polname)
      FROM pg_policy WHERE polrelid IN ('public.affiliate_clicks'::regclass,'public.affiliate_earnings'::regclass);`);
    const originalPolicies = await policies();
    for (const role of ['anon','authenticated']) {
      check((await sql(`SET ROLE ${role}; SELECT count(*) FROM public.affiliate_clicks;`)).endsWith('1'), role+'_original_public_read_reproduced');
      await sql(`BEGIN; SET ROLE ${role}; INSERT INTO public.affiliate_clicks(partner,tracking_id,event_type) VALUES('viator','fixture','click');
        INSERT INTO public.affiliate_earnings(partner,period_date) VALUES('klook',CURRENT_DATE);
        UPDATE public.affiliate_earnings SET clicks=99; DELETE FROM public.affiliate_earnings; ROLLBACK;`);
      check(await fingerprint() === initial, role+'_original_public_writes_reproduced_then_rolled_back');
    }
    await sql(affiliatePolicySql()); check(await fingerprint() === initial, 'restriction_preserves_all_rows');
    const restrictedPolicies = await policies();
    for (const role of ['anon','authenticated']) {
      for (const table of ['affiliate_clicks','affiliate_earnings']) {
        check((await sql(`SET ROLE ${role}; SELECT count(*) FROM public.${table};`)).endsWith('0'), role+'_'+table+'_no_rows');
        const values = table === 'affiliate_clicks' ? "(partner,tracking_id,event_type) VALUES('viator','denied','click')" : "(partner,period_date) VALUES('klook',CURRENT_DATE)";
        let denied=false; try { await sql(`SET ROLE ${role}; INSERT INTO public.${table}${values};`); }
        catch (error) { denied = /row-level security/.test(error.stderr ?? ''); }
        check(denied,role+'_'+table+'_insert_rls_denied');
        await sql(`SET ROLE ${role}; UPDATE public.${table} SET partner='klook'; DELETE FROM public.${table};`);
        check(await fingerprint() === initial, role+'_'+table+'_update_delete_no_effect');
      }
    }
    for (const table of ['affiliate_clicks','affiliate_earnings']) {
      const values = table === 'affiliate_clicks' ? "(partner,tracking_id,event_type) VALUES('viator','server','click')" : "(partner,period_date) VALUES('klook',CURRENT_DATE)";
      const result = await sql(`BEGIN; SET ROLE service_role; SELECT count(*) FROM public.${table}; INSERT INTO public.${table}${values};
        UPDATE public.${table} SET id=id; DELETE FROM public.${table}; ROLLBACK;`);
      check(result.includes('INSERT 0 1') && result.includes('UPDATE 2') && result.includes('DELETE 2'),table+'_service_role_crud_preserved');
    }
    let refused=false; try { await sql(affiliatePolicySql()); } catch { refused=true; }
    check(refused && await policies() === restrictedPolicies, 'repeat_refused_without_partial_change');
    await sql(affiliatePolicySql('restore'));
    check(await policies() === originalPolicies && await fingerprint() === initial, 'exact_local_rollback_policies_and_rows');
    await sql('CREATE POLICY unexpected ON public.affiliate_earnings FOR SELECT USING(true)');
    const drifted = await policies(); refused=false; try { await sql(affiliatePolicySql()); } catch { refused=true; }
    check(refused && await policies() === drifted, 'extra_policy_refused_atomically');
    await sql('DROP POLICY unexpected ON public.affiliate_earnings; ALTER POLICY "Allow affiliate click reads" ON public.affiliate_clicks USING(false)');
    const expressionDrift = await policies(); refused=false; try { await sql(affiliatePolicySql()); } catch { refused=true; }
    check(refused && await policies() === expressionDrift, 'changed_expression_refused_atomically');
    await sql('ALTER POLICY "Allow affiliate click reads" ON public.affiliate_clicks USING(true);');
    await sql(affiliatePolicySql()); check(await policies() === restrictedPolicies && await fingerprint() === initial, 'reapply_after_local_rollback_exact');
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
