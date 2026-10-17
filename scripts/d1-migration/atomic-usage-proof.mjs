// Offline proof of the captured production quota SQL. Never contacts Source or a paid provider.
import assert from 'node:assert/strict';
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
const name = `localley-quota-proof-${key}`;
const label = 'cyberlink.localley.quota-proof';
const output = value('--out');
const cleanupOnly = args.includes('--cleanup-only');
if (!cleanupOnly && !output) throw Error('usage: atomic-usage-proof.mjs --out NEW_REPORT [--key KEY] | --cleanup-only [--key KEY]');

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
    const fixture = JSON.parse(await readFile(resolve(root, '__tests__/fixtures/weighted-usage-source.json'), 'utf8'));
    check(createHash('md5').update(fixture.definition).digest('hex') === fixture.definitionMd5
      && fixture.definitionMd5 === 'a6a764c1cc36e9a8917512e24e9bce23', 'exact_captured_source_definition');
    const body = fixture.definition.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1]?.replace(/\r\n/g, '\n').trim();
    const migration = await readFile(resolve(root, 'supabase/migrations/003_weighted_usage_increment.sql'), 'utf8');
    check(body && body === migration.match(/AS \$\$([\s\S]*?)\$\$/)?.[1]?.replace(/\r\n/g, '\n').trim(), 'migration_body_matches_live_capture');
    report.definitionMd5 = fixture.definitionMd5;
    report.bodySha256 = createHash('sha256').update(body).digest('hex');
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
    await sql('CREATE TABLE public.usage_tracking(clerk_user_id text NOT NULL,usage_type text NOT NULL,period_start date NOT NULL,period_type text NOT NULL,count integer NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now(),UNIQUE(clerk_user_id,usage_type,period_start,period_type))');
    await sql(fixture.definition);
    for (const [owner, amount, cap, accepted, finalCount] of [['unit-race', 1, 10, 10, 10], ['weighted-race', 3, 10, 3, 9]]) {
      const results = await Promise.allSettled(Array.from({ length: 50 }, () => sql(
        `SELECT allowed::int,new_count FROM public.check_and_increment_usage_weighted('${owner}','chat_messages','daily',${cap},${amount})`)));
      check(results.every(x => x.status === 'fulfilled'), owner + '_50_calls_completed');
      const rows = results.map(x => x.value.split('|').map(Number));
      check(rows.filter(x => x[0] === 1).length === accepted && rows.filter(x => x[0] === 0).length === 50 - accepted, owner + '_cap_enforced');
      check(await sql(`SELECT count FROM usage_tracking WHERE clerk_user_id='${owner}'`) === String(finalCount), owner + '_exact_counter');
    }
    for (const [owner, amount] of [['unit-boundary', 1], ['weighted-boundary', 3]]) {
      const cap = 50 * amount;
      await sql(`DO $proof$ DECLARE r record; BEGIN FOR i IN 1..50 LOOP SELECT * INTO r FROM public.check_and_increment_usage_weighted('${owner}','chat_messages','daily',${cap},${amount}); IF r.allowed IS DISTINCT FROM true OR r.new_count <> i*${amount} THEN RAISE EXCEPTION 'boundary_acceptance_failed'; END IF; END LOOP; END $proof$`);
      check(await sql(`SELECT allowed::int,new_count FROM public.check_and_increment_usage_weighted('${owner}','chat_messages','daily',${cap},${amount})`) === `0|${cap}`, owner + '_50_allowed_51st_denied');
    }
    check(await sql("SELECT allowed::int,new_count,was_at_limit::int FROM public.check_and_increment_usage_weighted('zero','chat_messages','daily',0,1)") === '0|0|1', 'zero_cap_denied');
    check(await sql("SELECT count(*) FROM usage_tracking WHERE clerk_user_id='zero'") === '0', 'zero_cap_no_insert');
    for (const [period, expected] of [['daily', 'CURRENT_DATE'], ['weekly', "date_trunc('week',CURRENT_DATE)::date"], ['monthly', "date_trunc('month',CURRENT_DATE)::date"]]) {
      await sql(`SELECT * FROM public.check_and_increment_usage_weighted('date-${period}','chat_messages','${period}',1,1)`);
      check(await sql(`SELECT period_start=${expected} FROM usage_tracking WHERE clerk_user_id='date-${period}'`) === 't', period + '_period_key');
    }
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
