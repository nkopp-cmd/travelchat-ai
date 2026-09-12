// Creates a fresh cluster only. Never consumes DATABASE_URL, PGHOST, or production credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { prepareProductionBatch, sha256 } from './native-production.mjs';
import { isAbsolute, join } from 'node:path';

const bin = '/usr/lib/postgresql/18/bin/';
const backend = process.env.NATIVE_POSTGRES_BACKEND || 'local';
assert.ok(['local', 'docker'].includes(backend), 'Unknown PostgreSQL test backend');
// postgis/docker-postgis README documents 17-3.5; pulled and pinned on 2026-09-12.
const image = 'postgis/postgis@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6';
const docker = backend === 'docker';
const available = docker || existsSync('/usr/share/postgresql/18/extension/postgis.control');
if (!available && process.env.NATIVE_REQUIRE_POSTGIS === '1') throw new Error('Release gate blocked: PostgreSQL 18 PostGIS is unavailable');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const place = (id = 73, age = 60000) => ({ kind: 'place', providerPlaceId: `visit-seoul:${id}`, citySlug: 'seoul', countryCode: 'KR',
  name: { en: 'Gyeongbokgung Palace' }, address: { en: '161 Sajik-ro, Seoul' }, latitude: 37.5796, longitude: 126.977,
  verified: false, state: 'pending', issues: [], images: [], provenance: { sourceUrl: `https://english.visitseoul.net/attractions/Palace_/${id}`, observedAt: new Date(Date.now() - age).toISOString() } });
const batch = (places, mappings = []) => prepareProductionBatch({ schemaVersion: 'localley-native-v1', citySlug: 'seoul', publicationReady: false, collection: { paidProviderCalls: 0 }, places }, mappings);
const rpc = b => `SELECT public.native_production_ingest(${[b.p_target,b.p_origin,b.p_body,b.p_hash].map(quote).join(',')});`;
const withMappings = (b, mappings) => {
  const envelope = JSON.parse(b.p_body); envelope.mappings = mappings;
  const p_body = JSON.stringify(envelope);
  return { ...b, p_body, p_hash: sha256(p_body) };
};

test('disposable PostgreSQL / real PostGIS transaction and RLS contract', { skip: !available && 'BLOCKED: local PostgreSQL 18 has no PostGIS; select the explicit docker backend' }, async t => {
  const parent = process.env.GITHUB_ACTIONS === 'true'
    ? process.env.RUNNER_TEMP
    : '/home/dev/projects/CyberLink/codex-work/tmp/opencode';
  assert.ok(typeof parent === 'string' && isAbsolute(parent) && statSync(parent).isDirectory(), 'Existing private test scratch directory required');
  const dir = mkdtempSync(join(parent, 'nativepg-'));
  const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: dir };
  const container = 'localley-native-' + dir.split('/').pop();
  const dockerRun = args => {
    const result = spawnSync('docker', ['--host', 'unix:///var/run/docker.sock', ...args], { env, encoding: 'utf8', timeout: 60000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message); return result.stdout.trim();
  };
  const command = (name, args) => docker
    ? ['docker', ['--host', 'unix:///var/run/docker.sock', 'exec', '-i', container, name, ...args]]
    : [bin + name, args];
  const run = (name, args, input) => {
    const [cmd, argv] = command(name, args);
    const result = spawnSync(cmd, argv, { env, input, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', docker ? '/var/run/postgresql' : dir, '-p', '55487', '-U', 'postgres', '-d', 'postgres'];
  const sql = text => run('psql', args, text);
  const service = text => sql(`SET ROLE service_role; ${text}`);
  const denied = (text, pattern) => {
    const [cmd, argv] = command('psql', args);
    const result = spawnSync(cmd, argv, { env, input: text, encoding: 'utf8', timeout: 60000 });
    assert.notEqual(result.status, 0); if (pattern) assert.match(result.stderr, pattern);
  };
  let started = false;
  try {
    if (docker) {
      mkdirSync(dir + '/data');
      mkdirSync(dir + '/socket', { mode: 0o700 });
      dockerRun(['run', '--detach', '--pull=never', '--name', container, '--network', 'none',
        '--memory', '1g', '--memory-swap', '1g', '--cpus', '2', '--pids-limit', '128',
        '--user', `${process.getuid()}:${process.getgid()}`, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--mount', `type=bind,src=${dir},dst=/fixture`,
        '--mount', `type=bind,src=${dir}/socket,dst=/var/run/postgresql`,
        '--mount', `type=bind,src=${dir}/data,dst=/var/lib/postgresql/data`,
        '-e', 'PGDATA=/fixture/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
        '-e', 'PGHOST=/var/run/postgresql', '-e', 'PGPORT=55487',
        '-e', 'POSTGRES_INITDB_ARGS=--no-locale --encoding=UTF8', image,
        'postgres', '-k', '/var/run/postgresql', '-p', '55487', '-c', 'listen_addresses=', '-c', 'unix_socket_permissions=0700']);
      started = true;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [cmd, argv] = command('pg_isready', ['-h', '/var/run/postgresql', '-p', '55487', '-U', 'postgres']);
        if (dockerRun(['exec', container, 'readlink', '/proc/1/exe']).endsWith('/postgres')
          && spawnSync(cmd, argv, { env, timeout: 5000 }).status === 0) break;
        if (attempt === 99) throw Error('Isolated PostGIS container did not become ready');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const config = JSON.parse(dockerRun(['inspect', container]))[0];
      assert.equal(config.HostConfig.NetworkMode, 'none');
      assert.equal(config.HostConfig.Memory, 1073741824);
      assert.equal(config.HostConfig.NanoCpus, 2000000000);
      assert.deepEqual(config.HostConfig.PortBindings, {});
      assert.equal(statSync(dir).mode & 0o777, 0o700);
      assert.equal(sql('SHOW listen_addresses;'), '');
      t.diagnostic(`Docker image: ${image}`);
    } else {
      run('initdb', ['-D', dir + '/data', '-U', 'postgres', '-A', 'trust', '--no-locale']);
      run('pg_ctl', ['-D', dir + '/data', '-l', dir + '/postgres.log', '-o', `-k ${dir} -p 55487 -c listen_addresses=''`, '-w', 'start']); started = true;
    }
    // Supabase service_role bypasses RLS, but still needs explicit SQL privileges.
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    sql(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    t.diagnostic(`Node ${process.version}; ${run('psql', ['--version'])}; ${sql('SELECT version(); SELECT postgis_full_version();')}`);
    sql(readFileSync(new URL('../supabase/migrations/20260714235000_multi_city_geography_foundation.sql', import.meta.url), 'utf8'));
    sql('GRANT SELECT, UPDATE(id) ON public.spots TO service_role;');
    sql(readFileSync(new URL('../supabase/migrations/20260912090631_native_scrapelet_production_ingest.sql', import.meta.url), 'utf8'));
    const p = place(), b = batch([p]);
    await t.test('parent activation and correct/wrong target gates', () => {
      denied(`SET ROLE service_role; ${rpc(b)}`, /Parent review/);
      sql('UPDATE native_private.metadata SET ingest_enabled=true;');
      denied(`SET ROLE service_role; ${rpc({ ...b, p_target: 'preview' })}`, /target/);
      denied(`SET ROLE service_role; ${rpc({ ...b, p_origin: 'http://localhost' })}`, /target/);
      denied(rpc(b), /role/);
    });
    const id = 'abcdefab-1111-4111-8111-111111111abc';
    sql(`INSERT INTO spots(id,name,address,description,location,category,photos,localley_score,tips) VALUES('${id}', '{"en":"Gyeongbokgung Palace","ko":"preserve"}', '{"en":"161 Sajik-ro, Seoul"}', '{"en":"curated"}', 'SRID=4326;POINT(126.977 37.5796)', 'culture', ARRAY['unchanged-photo'], 6, '{"en":"unchanged"}'); CREATE TABLE public.native_test_relation(spot_id uuid REFERENCES spots(id), payload bytea); INSERT INTO public.native_test_relation VALUES('${id}', decode('00ff10','hex'));`);
    const destination = '22222222-2222-4222-8222-222222222222';
    const area = '33333333-3333-4333-8333-333333333333';
    sql(`INSERT INTO geo_countries(code,name,default_currency) VALUES('KR','{"en":"South Korea"}','KRW');
      INSERT INTO geo_destinations(id,slug,name,country_code,center,timezone,currency,ring)
        VALUES('${destination}','seoul','{"en":"Seoul"}','KR','SRID=4326;POINT(126.977 37.5796)','Asia/Seoul','KRW',1);
      INSERT INTO geo_local_areas(id,destination_id,kind,slug,name,confidence,review_status)
        VALUES('${area}','${destination}','district','jongno','{"en":"Jongno"}',1,'human_verified');
      UPDATE spots SET destination_id='${destination}',local_area_id='${area}' WHERE id='${id}';`);
    const snapshotSql = 'SELECT row_to_json(s)::text FROM spots s ORDER BY id; SELECT row_to_json(r)::text FROM native_test_relation r; SELECT row_to_json(d)::text FROM geo_destinations d ORDER BY id; SELECT row_to_json(a)::text FROM geo_local_areas a ORDER BY id;';
    const snapshot = () => sql(snapshotSql);
    const privateSnapshot = () => sql(['identity_registry','candidates','review_bindings','receipts']
      .map(table => `SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') FROM native_private.${table} r;`).join('\n'));
    const before = snapshot();
    await t.test('real geography foreign keys enforce membership and preserve destination on area deletion', () => {
      denied(`UPDATE spots SET destination_id=NULL WHERE id='${id}';`, /spots_local_area_requires_destination/);
      denied(`UPDATE spots SET local_area_id='44444444-4444-4444-8444-444444444444' WHERE id='${id}';`, /spots_local_area_destination_fk/);
      assert.equal(sql(`BEGIN; DELETE FROM geo_local_areas WHERE id='${area}'; SELECT destination_id::text || ':' || (local_area_id IS NULL)::text FROM spots WHERE id='${id}'; ROLLBACK;`), destination + ':true');
      assert.equal(snapshot(), before);
    });
    await t.test('concurrent retries serialize to one receipt and candidate', async () => {
      const send = () => new Promise((resolve, reject) => {
        const [cmd, argv] = command('psql', args);
        const child = spawn(cmd, argv, { env, timeout: 60000 }); let error = '';
        child.stderr.on('data', data => { error += data; }); child.stdout.resume();
        child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error(error)));
        child.stdin.end(`SET ROLE service_role; ${rpc(b)}`);
      });
      await Promise.all([send(), send(), send()]);
      assert.equal(sql('SELECT count(*) FROM native_private.receipts; SELECT count(*) FROM native_private.candidates;'), '1\n1');
    });
    await t.test('all anonymous/authenticated CRUD and RPC denied; RLS independently hides evidence', () => {
      for (const role of ['anon','authenticated']) {
        denied(`SET ROLE ${role}; ${rpc(b)}`, /permission denied/);
        for (const table of ['metadata','identity_registry','candidates','review_bindings','receipts']) {
          for (const operation of [`SELECT * FROM`, `DELETE FROM`, `UPDATE`, `INSERT INTO`]) {
            const column = table === 'metadata' ? 'singleton' : table === 'receipts' ? 'batch_hash' : 'source_key';
            const suffix = operation === 'UPDATE' ? ` SET ${column}=${column}` : operation === 'INSERT INTO' ? ' DEFAULT VALUES' : '';
            denied(`SET ROLE ${role}; ${operation} native_private.${table}${suffix};`, /permission denied/);
          }
        }
        assert.equal(sql(`BEGIN; GRANT USAGE ON SCHEMA native_private TO ${role}; GRANT SELECT ON ALL TABLES IN SCHEMA native_private TO ${role}; SET ROLE ${role}; ${['metadata','identity_registry','candidates','review_bindings','receipts'].map(table => `SELECT count(*) FROM native_private.${table};`).join(' ')} ROLLBACK;`), '0\n0\n0\n0\n0');
      }
      assert.equal(sql('BEGIN; ALTER ROLE service_role NOBYPASSRLS; SET ROLE service_role; SELECT count(*) FROM native_private.candidates; ROLLBACK;'), '1');
    });
    await t.test('older does not overwrite; equal different hash rolls back whole batch', () => {
      service(rpc(batch([{ ...p, provenance: { ...p.provenance, observedAt: new Date(Date.now()-3600000).toISOString() } }])));
      assert.equal(sql('SELECT payload_hash FROM native_private.candidates;'), JSON.parse(b.p_body).rows[0].hash);
      const conflict = batch([place(1), { ...p, name: { en: 'conflict' } }]);
      const count = privateSnapshot();
      denied(`SET ROLE service_role; ${rpc(conflict)}`, /Equal observation conflict/);
      assert.equal(privateSnapshot(), count);
    });
    await t.test('server validates payload hash even with a valid outer batch hash', () => {
      const body = JSON.parse(b.p_body); body.rows[0].hash = '0'.repeat(64);
      const p_body = JSON.stringify(body);
      denied(`SET ROLE service_role; ${rpc({ ...b, p_body, p_hash: sha256(p_body) })}`, /payload hash/);
    });
    const expected = JSON.parse(sql(`SELECT jsonb_build_object('name',name,'address',address,'location',location::text,'google_place_id',google_place_id,'destination_id',destination_id,'local_area_id',local_area_id) FROM spots WHERE id='${id}';`));
    const choice = { sourceKey: 'english.visitseoul.net:visit-seoul:73', spotId: id, identityApproved: true,
      sourceDomain: 'english.visitseoul.net', sourceUrl: p.provenance.sourceUrl, expected };
    await t.test('service_role BYPASSRLS still requires UPDATE(id) for the read-only FOR SHARE lock', () => {
      assert.equal(sql("SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'; SELECT has_column_privilege('service_role','public.spots','id','UPDATE');"), 't\nt');
      const beforePrivate = privateSnapshot();
      denied(`BEGIN; REVOKE UPDATE(id) ON public.spots FROM service_role; SET ROLE service_role; ${rpc(withMappings(b,[choice]))}`, /permission denied for table spots/);
      assert.equal(privateSnapshot(), beforePrivate);
      assert.equal(snapshot(), before);
      const recon = sql(readFileSync(new URL('../supabase/native-production-recon.sql', import.meta.url), 'utf8'));
      assert.match(recon, /^t\|t\|t\|t\|t\n/);
    });
    await t.test('explicit exact snapshot binds UUID; changed geography/source or snapshot rejects', () => {
      for (const altered of [{ ...choice, sourceDomain: 'evil.example' }, { ...choice, sourceUrl: 'https://english.visitseoul.net/other_/99' },
        { ...choice, expected: { ...expected, destination_id: null } }, { ...choice, expected: { ...expected, local_area_id: null } },
        { ...choice, expected: { ...expected, location: 'SRID=4326;POINT(127 37.5)' } },
        { ...choice, expected: { ...expected, name: { en: 'different' } } }]) {
        const envelope = JSON.parse(b.p_body); envelope.mappings = [altered];
        const p_body = JSON.stringify(envelope);
        denied(`SET ROLE service_role; ${rpc({ ...b, p_body, p_hash: sha256(p_body) })}`);
      }
      // Bypass the client normalizer: direct RPC callers must also store canonical UUID text.
      service(rpc(withMappings(b, [{ ...choice, spotId: id.toUpperCase() }])));
      assert.equal(sql('SELECT spot_id FROM native_private.review_bindings;'), id);
      assert.equal(sql("SELECT manifest->>'spotId' FROM native_private.review_bindings;"), id);
      denied('SET ROLE service_role; DELETE FROM native_private.review_bindings;', /permission denied/);
      denied('SET ROLE service_role; DELETE FROM native_private.identity_registry;', /permission denied/);
    });
    await t.test('direct RPC UUID-case retries preserve the immutable binding and reject mixed-case duplicates', () => {
      const binding = () => sql('SELECT row_to_json(r)::text FROM native_private.review_bindings r;');
      const beforeBinding = binding();
      service(rpc(withMappings(b, [choice])));
      const upperRetry = withMappings(b, [{ ...choice, spotId: id.toUpperCase() }]);
      const p_body = upperRetry.p_body + ' ';
      // Force a new receipt so the uppercase retry exercises manifest comparison, not the receipt shortcut.
      service(rpc({ ...upperRetry, p_body, p_hash: sha256(p_body) }));
      assert.equal(binding(), beforeBinding);
      const other = place(3), multiple = batch([p,other]);
      const otherChoice = { ...choice, sourceKey: 'english.visitseoul.net:visit-seoul:3', sourceUrl: other.provenance.sourceUrl };
      for (const mappings of [[choice,{ ...otherChoice, spotId: id.toUpperCase() }],
        [{ ...choice, spotId: id.toUpperCase() },otherChoice]]) {
        const beforePrivate = privateSnapshot();
        denied(`SET ROLE service_role; ${rpc(withMappings(multiple,mappings))}`, /Duplicate or missing binding UUID/);
        assert.equal(privateSnapshot(), beforePrivate);
      }
      assert.equal(snapshot(), before);
    });
    await t.test('new observations update source facts without changing approved bindings or public rows', () => {
      const newer = { ...p, name: { en: 'Newer source description' }, provenance: { ...p.provenance,
        observedAt: new Date(Date.parse(p.provenance.observedAt)+1000).toISOString() } };
      const next = batch([newer]);
      const beforePrivate = privateSnapshot();
      const beforeBinding = sql('SELECT row_to_json(r)::text FROM native_private.review_bindings r;');
      const result = sql(`BEGIN; SET ROLE service_role; ${rpc(next)} RESET ROLE; ${snapshotSql}
        SELECT row_to_json(r)::text FROM native_private.review_bindings r;
        SELECT payload_hash FROM native_private.candidates WHERE source_key=${quote(choice.sourceKey)}; ROLLBACK;`).split('\n');
      assert.equal(result.slice(1,-2).join('\n'), before);
      assert.equal(result.at(-2), beforeBinding);
      assert.equal(result.at(-1), JSON.parse(next.p_body).rows[0].hash);
      assert.equal(privateSnapshot(), beforePrivate);
      assert.equal(snapshot(), before);
    });
    await t.test('permanent manifest and duplicate UUID conflicts roll back all private state', () => {
      const beforePrivate = privateSnapshot();
      const body = JSON.parse(b.p_body); body.mappings = [{ ...choice, extra: 'changed approval' }];
      const p_body = JSON.stringify(body);
      denied(`SET ROLE service_role; ${rpc({ ...b, p_body, p_hash: sha256(p_body) })}`, /Permanent binding conflict/);
      const other = place(3);
      denied(`SET ROLE service_role; ${rpc(batch([other], [{ ...choice, sourceKey: 'english.visitseoul.net:visit-seoul:3', sourceUrl: other.provenance.sourceUrl }]))}`, /unique constraint/);
      denied(`DELETE FROM spots WHERE id='${id}';`, /foreign key constraint/);
      denied('SET ROLE service_role; UPDATE native_private.metadata SET ingest_enabled=false;', /permission denied/);
      denied("SET ROLE service_role; UPDATE native_private.review_bindings SET manifest='{}';", /permission denied/);
      assert.equal(privateSnapshot(), beforePrivate);
      assert.equal(snapshot(), before);
    });
    await t.test('receipt expiration never deletes identities/bindings; replay preserves public bytes', () => {
      sql("UPDATE native_private.receipts SET imported_at=now()-interval '15 days';");
      service(rpc(batch([place(2)])));
      assert.equal(sql('SELECT count(*) FROM native_private.receipts; SELECT count(*) FROM native_private.review_bindings;'), '1\n1');
      service(rpc(b)); assert.equal(snapshot(), before);
    });
    await t.test('5k cap rolls back excess candidates atomically', () => {
      sql("INSERT INTO native_private.identity_registry(source_key) SELECT 'english.visitseoul.net:visit-seoul:' || n FROM generate_series(10000,14997) n;");
      const beforePrivate = privateSnapshot();
      denied(`SET ROLE service_role; ${rpc(batch([place(999)]))}`, /cap exceeded/);
      assert.equal(sql('SELECT count(*) FROM native_private.identity_registry;'), '5000');
      assert.equal(privateSnapshot(), beforePrivate);
    });
    await t.test('changed column type and unvalidated or weakened constraints fail closed', () => {
      denied(`BEGIN; ALTER TABLE spots ALTER COLUMN google_place_id TYPE varchar(200); SET ROLE service_role; ${rpc(b)}`, /schema mismatch/);
      denied(`BEGIN; ALTER TABLE spots DROP CONSTRAINT spots_local_area_requires_destination; ALTER TABLE spots ADD CONSTRAINT spots_local_area_requires_destination CHECK (local_area_id IS NULL OR destination_id IS NOT NULL) NOT VALID; SET ROLE service_role; ${rpc(b)}`, /constraint mismatch/);
      denied(`BEGIN; ALTER TABLE spots DROP CONSTRAINT spots_local_area_requires_destination; ALTER TABLE spots ADD CONSTRAINT spots_local_area_requires_destination CHECK (true); SET ROLE service_role; ${rpc(b)}`, /constraint mismatch/);
    });
    await t.test('missing geography constraint fails closed', () => {
      sql('ALTER TABLE spots DROP CONSTRAINT spots_local_area_requires_destination;');
      denied(`SET ROLE service_role; ${rpc(b)}`, /constraint mismatch/);
    });
    await t.test('operational rollback disables RPC and retains permanent bindings', () => {
      sql(readFileSync(new URL('../supabase/native-production.rollback-draft.sql', import.meta.url), 'utf8'));
      denied(`SET ROLE service_role; ${rpc(b)}`, /permission denied/);
      assert.equal(sql('SELECT ingest_enabled FROM native_private.metadata; SELECT count(*) FROM native_private.review_bindings;'), 'f\n1');
    });
    assert.equal(snapshot(), before);
  } catch (error) {
    if (docker && started) {
      const logs = spawnSync('docker', ['--host', 'unix:///var/run/docker.sock', 'logs', container], { env, encoding: 'utf8', timeout: 5000 });
      t.diagnostic((logs.stdout || '') + (logs.stderr || ''));
    }
    throw error;
  } finally {
    if (started) {
      // Retain data if stopping fails; never remove a running cluster's files.
      if (docker) dockerRun(['rm', '--force', '--volumes', container]);
      else run('pg_ctl', ['-D', dir + '/data', '-m', 'fast', '-w', 'stop']);
    }
    rmSync(dir, { recursive: true, force: true });
    assert.equal(existsSync(dir), false);
    t.diagnostic(`Removed fixture directory ${dir} and stopped ${backend} backend`);
  }
});
