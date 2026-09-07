import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Local Docker only: no ports, network, host mounts, credentials, or API calls.
const migrationName = '20260907161457_harden_saved_spots_owner_rls.sql';
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
const container = `localley-saved-spots-rls-${randomUUID()}`;
function docker(args, input) {
  return spawnSync('docker', args, { input, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
}
function sql(input, errorPattern) {
  const result = docker(['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], input);
  if (errorPattern) {
    assert.notEqual(result.status, 0, 'SQL must fail');
    assert.match(result.stderr, errorPattern);
  } else {
    assert.equal(result.status, 0, result.stderr || String(result.error));
  }
  return result.stdout.trim();
}
function as(role, sub, statement, errorPattern) {
  return sql(`SET ROLE ${role}; SET request.jwt.claims = '${JSON.stringify(sub ? { sub } : {})}'; ${statement}`, errorPattern);
}
const baseline = `
  DROP TABLE IF EXISTS public.saved_spots;
  CREATE TABLE public.saved_spots (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clerk_user_id text NOT NULL);
  ALTER TABLE public.saved_spots ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_spots TO anon, authenticated, service_role;
  CREATE POLICY "Users can save spots" ON public.saved_spots FOR INSERT TO PUBLIC WITH CHECK (true);
  CREATE POLICY "Users can unsave spots" ON public.saved_spots FOR DELETE TO PUBLIC USING (true);
  CREATE POLICY "Users can view own saved spots" ON public.saved_spots FOR SELECT TO PUBLIC USING (true);
  INSERT INTO public.saved_spots (clerk_user_id) VALUES ('user_bob');
`;
const snapshot = `SELECT jsonb_build_object(
  'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p
    WHERE schemaname = 'public' AND tablename = 'saved_spots'),
  'rls', relrowsecurity, 'acl', relacl::text
) FROM pg_class WHERE oid = 'public.saved_spots'::regclass;`;
let started = false;
function cleanup() {
  if (started) {
    const result = docker(['rm', '-f', '-v', container]);
    if (result.status !== 0) throw new Error(`Container cleanup failed: ${result.stderr}`);
    started = false;
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { cleanup(); process.exit(1); });
}
try {
  started = true;
  const run = docker(['run', '-d', '--rm', '--pull', 'never', '--name', container,
    '--network', 'none', '--memory', '256m', '--memory-swap', '256m', '--cpus', '0.5', '--pids-limit', '64',
    '--tmpfs', '/var/lib/postgresql/data:rw,size=192m',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine',
    '-c', 'shared_buffers=16MB', '-c', 'max_connections=10']);
  assert.equal(run.status, 0, run.stderr || String(run.error));
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (docker(['exec', container, 'pg_isready', '-U', 'postgres']).status === 0) { ready = true; break; }
    await delay(500);
  }
  assert.ok(ready, 'Postgres startup timed out');
  assert.match(sql('SHOW server_version;'), /^17\.11(?:\s|$)/);
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;`);
  sql(baseline);
  const original = sql(snapshot);
  const originalPolicies = JSON.parse(original).policies;
  assert.equal(originalPolicies.length, 3);
  for (const policy of originalPolicies) {
    assert.deepEqual(policy.roles, ['public']);
    assert.equal(policy.permissive, 'PERMISSIVE');
    assert.equal(policy.cmd === 'INSERT' ? policy.with_check : policy.qual, 'true');
  }
  assert.equal(as('anon', null, 'SELECT count(*) FROM public.saved_spots;'), '1');
  console.log('PASS: original PUBLIC/true policies reproduce anonymous count=1');

  sql(migration);
  const fixed = sql(snapshot);
  sql(migration);
  assert.equal(sql(snapshot), fixed, 'repeat migration is idempotent');
  const fixedState = JSON.parse(fixed);
  assert.equal(fixedState.acl, JSON.parse(original).acl, 'grants unchanged');
  assert.equal(fixedState.rls, true);
  assert.deepEqual(fixedState.policies.map(p => p.cmd).sort(), ['DELETE', 'INSERT', 'SELECT']);
  for (const policy of fixedState.policies) assert.deepEqual(policy.roles, ['authenticated']);
  assert.equal(as('anon', null, 'SELECT count(*) FROM public.saved_spots;'), '0');
  as('anon', null, "INSERT INTO public.saved_spots (clerk_user_id) VALUES ('user_alice');", /row-level security/);
  assert.equal(as('anon', null, 'WITH d AS (DELETE FROM public.saved_spots RETURNING *) SELECT count(*) FROM d;'), '0');
  assert.equal(as('authenticated', 'user_alice', "INSERT INTO public.saved_spots (clerk_user_id) VALUES ('user_alice') RETURNING clerk_user_id;"), 'user_alice');
  assert.equal(as('authenticated', 'user_alice', 'SELECT clerk_user_id FROM public.saved_spots;'), 'user_alice');
  assert.equal(as('authenticated', 'user_bob', 'SELECT clerk_user_id FROM public.saved_spots;'), 'user_bob');
  as('authenticated', 'user_alice', "INSERT INTO public.saved_spots (clerk_user_id) VALUES ('user_bob');", /row-level security/);
  assert.equal(as('authenticated', 'user_alice', "WITH d AS (DELETE FROM public.saved_spots WHERE clerk_user_id = 'user_bob' RETURNING *) SELECT count(*) FROM d;"), '0');
  assert.equal(as('authenticated', 'user_alice', "WITH u AS (UPDATE public.saved_spots SET clerk_user_id = 'user_bob' RETURNING *) SELECT count(*) FROM u;"), '0');
  assert.equal(as('authenticated', null, 'SELECT count(*) FROM public.saved_spots;'), '0');
  as('authenticated', null, "INSERT INTO public.saved_spots (clerk_user_id) VALUES ('user_alice');", /row-level security/);
  assert.equal(as('service_role', null, 'SELECT count(*) FROM public.saved_spots;'), '2');
  assert.equal(as('service_role', null, 'SELECT string_agg(clerk_user_id, \',\' ORDER BY clerk_user_id) FROM public.saved_spots;'), 'user_alice,user_bob');
  assert.equal(as('authenticated', 'user_alice', 'DELETE FROM public.saved_spots RETURNING clerk_user_id;'), 'user_alice');
  assert.equal(as('service_role', null, 'SELECT clerk_user_id FROM public.saved_spots;'), 'user_bob');
  console.log('PASS: anon denial, owner isolation, forged-owner denial, no UPDATE, service_role access, repeat application');

  sql(baseline);
  sql('ALTER TABLE public.saved_spots RENAME COLUMN clerk_user_id TO invalid_owner;');
  const invalid = sql(snapshot);
  sql(migration, /column "clerk_user_id" does not exist/);
  assert.equal(sql(snapshot), invalid, 'failed CREATE restores all dropped policies');
  sql('ALTER TABLE public.saved_spots RENAME COLUMN invalid_owner TO clerk_user_id;');
  assert.equal(sql(snapshot), original);
  sql('CREATE POLICY "unknown permissive" ON public.saved_spots FOR ALL TO PUBLIC USING (true);');
  const unknown = sql(snapshot);
  sql(migration, /Unexpected permissive saved_spots policy/);
  assert.equal(sql(snapshot), unknown, 'unknown policy is never dropped');
  sql(baseline);
  sql('ALTER TABLE public.saved_spots DISABLE ROW LEVEL SECURITY;');
  const disabled = sql(snapshot);
  sql(migration, /RLS must already be enabled/);
  assert.equal(sql(snapshot), disabled);
  console.log('PASS: invalid-schema transaction rollback, unknown-policy refusal, disabled-RLS refusal');
  console.log(`PASS: ${migrationName} on PostgreSQL 17.11; no hosted JWT or HTTP verification`);
} finally {
  cleanup();
}
