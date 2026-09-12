import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const parent = "/home/dev/projects/CyberLink/codex-work/tmp/opencode";
const bin = "/usr/lib/postgresql/18/bin";
const migration = "supabase/migrations/20260911104013_save_itinerary_snapshot.sql";
const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
const expected = { title: "Original", city: "Seoul", activities: [{ day: 1, activities: [] }], highlights: null, estimated_cost: null };
const replacement = { ...expected, title: "Saved", activities: { dailyPlans: [{ day: 1, activities: [] }], insights: [] }, highlights: [] };
const fields = Object.keys(expected);
let cluster;
let env;
let started = false;

const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const json = (value) => value === undefined ? "NULL" : `${literal(JSON.stringify(value))}::jsonb`;
const rpc = (snapshot = expected, next = replacement, itineraryId = id) =>
    `SELECT coalesce(jsonb_agg(to_jsonb(saved)), '[]'::jsonb) FROM public.save_itinerary_snapshot(${itineraryId === null ? "NULL" : literal(itineraryId)}::uuid, ${json(snapshot)}, ${json(next)}) AS saved;`;
const session = (query, owner = "owner", role = "authenticated") =>
    `SET ROLE ${role}; SET request.jwt.claims = ${literal(JSON.stringify(owner === null ? {} : { sub: owner }))}; ${query}`;
const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
function sql(query) {
    return execFileSync("/usr/bin/psql", args, { env, input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function save(snapshot = expected, next = replacement, owner = "owner", itineraryId = id) {
    return JSON.parse(sql(session(rpc(snapshot, next, itineraryId), owner)));
}
function denied(query, state) {
    assert.throws(() => sql(query), (error) => {
        assert.match(String(error.stderr), new RegExp(`ERROR: +${state}:`));
        return true;
    });
}
function asyncSql(query) {
    const child = spawn("/usr/bin/psql", args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    const done = new Promise((resolve, reject) => {
        child.stdout.on("data", (data) => { output += data; });
        child.stderr.on("data", (data) => { errors += data; });
        child.on("error", reject);
        child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
    });
    child.stdin.end(query);
    return done;
}

before(() => {
    assert.notEqual(process.getuid(), 0, "Never initialize this fixture as root");
    assert.ok(lstatSync(parent).isDirectory(), "Verify the approved scratch parent");
    cluster = mkdtempSync(`${parent}/rpc-`);
    env = { PATH: process.env.PATH, LANG: "C.UTF-8", PGHOST: cluster, PGPORT: "55439", PGUSER: userInfo().username, PGDATABASE: "postgres", PGCONNECT_TIMEOUT: "5" };
    execFileSync(`${bin}/initdb`, ["-D", `${cluster}/data`, "--auth-local=trust", "--auth-host=reject", "--encoding=UTF8", "--no-locale"], { env, stdio: "pipe" });
    execFileSync(`${bin}/pg_ctl`, ["-D", `${cluster}/data`, "-l", `${cluster}/postgres.log`, "-o", `-c listen_addresses='' -c unix_socket_directories='${cluster}' -c unix_socket_permissions=0700 -p 55439 -c shared_buffers=16MB -c max_connections=10`, "-w", "start"], { env, stdio: "pipe" });
    started = true;
    console.log(`Private cluster: ${cluster}; ${sql("SELECT version();")}`);
    assert.equal(sql("SHOW listen_addresses;"), "");

    // Use the exact repository table and policies, not a weaker test-only policy.
    const schema = readFileSync(resolve(root, "supabase/schema.sql"), "utf8");
    const table = schema.match(/CREATE TABLE itineraries \([\s\S]*?\n\);/)?.[0];
    const policies = readFileSync(resolve(root, "supabase/rls-policies.sql"), "utf8")
        .match(/-- Itineraries policies\n([\s\S]*?)\n-- User challenges/)?.[1];
    assert.ok(table && policies, "Repository fixture sources must exist");
    sql(`CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
        CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
        CREATE ROLE rpc_public_probe NOLOGIN NOSUPERUSER NOBYPASSRLS;
        CREATE SCHEMA auth;
        CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
        GRANT USAGE ON SCHEMA auth TO authenticated, anon;
        CREATE TABLE public.users (id UUID PRIMARY KEY);
        INSERT INTO public.users VALUES (${literal(userId)});
        ${table}
        ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
        ${policies}
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.itineraries TO authenticated, anon;`);
    sql(readFileSync(resolve(root, migration), "utf8"));
});

after(() => {
    if (started) {
        execFileSync(`${bin}/pg_ctl`, ["-D", `${cluster}/data`, "-m", "immediate", "-w", "stop"], { env, stdio: "pipe" });
        started = false;
    }
    if (cluster) {
        assert.equal(resolve(cluster, ".."), parent);
        assert.ok(cluster.startsWith(`${parent}/rpc-`));
        rmSync(cluster, { recursive: true });
        console.log(`Removed private cluster: ${cluster}`);
    }
});

beforeEach(() => {
    sql(`TRUNCATE public.itineraries;
        INSERT INTO public.itineraries (id, user_id, clerk_user_id, title, city, days, activities, shared, share_code)
        VALUES (${literal(id)}, ${literal(userId)}, 'owner', 'Original', 'Seoul', 2, ${json(expected.activities)}, true, 'keep-code'),
               (${literal(otherId)}, ${literal(userId)}, 'other', 'Original', 'Seoul', 2, ${json(expected.activities)}, false, NULL);`);
});

test("migration installs an invoker function with a safe search path and restricted grants", () => {
    const config = JSON.parse(sql("SELECT jsonb_build_object('definer', prosecdef, 'config', proconfig) FROM pg_proc WHERE oid = 'public.save_itinerary_snapshot(uuid,jsonb,jsonb)'::regprocedure;"));
    assert.equal(config.definer, false);
    assert.deepEqual(config.config, ['search_path=""']);
    for (const role of ["anon", "rpc_public_probe"]) {
        assert.equal(sql(`SELECT has_function_privilege('${role}', 'public.save_itinerary_snapshot(uuid,jsonb,jsonb)', 'EXECUTE');`), "f");
    }
    assert.equal(sql("SELECT has_function_privilege('authenticated', 'public.save_itinerary_snapshot(uuid,jsonb,jsonb)', 'EXECUTE');"), "t");
    assert.equal(sql(session("SELECT current_user = 'authenticated' AND NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname = current_user;")), "t");
});

test("owner saves and only the five editable columns change", () => {
    const original = JSON.parse(sql(`SELECT to_jsonb(itineraries) FROM public.itineraries WHERE id = '${id}';`));
    const [saved] = save(expected, { ...replacement, id: otherId, clerk_user_id: "other", user_id: otherId, days: 999, share_code: "stolen" });
    assert.ok(saved);
    for (const [key, value] of Object.entries(original)) {
        assert.deepEqual(saved[key], fields.includes(key) ? replacement[key] : value, key);
    }
});

test("cross-owner writes and reads fail under the actual RLS policies", () => {
    assert.deepEqual(save(expected, replacement, "other"), []);
    assert.deepEqual(save(expected, replacement, "owner", otherId), []);
    assert.equal(sql(session(`SELECT count(*) FROM public.itineraries WHERE id = '${otherId}';`)), "0");
    assert.equal(sql(session(`WITH changed AS (UPDATE public.itineraries SET title = 'bad' WHERE id = '${otherId}' RETURNING *) SELECT count(*) FROM changed;`)), "0");
    assert.equal(sql(`SELECT title FROM public.itineraries WHERE id = '${otherId}';`), "Original");
});

test("anon cannot call the RPC even with a forged fixture subject", () => {
    denied(session(rpc(), "owner", "anon"), "42501");
});

test("authenticated callers without a subject cannot write", () => {
    assert.deepEqual(save(expected, replacement, null), []);
});

test("SQL NULL highlights do not match empty text arrays", () => {
    assert.deepEqual(save({ ...expected, highlights: [] }), []);
    assert.equal(save()[0].title, "Saved");
    assert.equal(sql(`SELECT highlights IS NOT NULL AND cardinality(highlights) = 0 FROM public.itineraries WHERE id = '${id}';`), "t");
    assert.deepEqual(save({ ...replacement, highlights: null }, expected), []);
    assert.equal(save(replacement, expected)[0].highlights, null);
});

test("text arrays preserve order, quotes, backslashes, empty strings and literal NULL", () => {
    const highlights = ['a,b', 'a"b', "a\\b", "NULL", "", "{}", "a'b"];
    const next = { ...replacement, highlights };
    assert.deepEqual(save(expected, next)[0].highlights, highlights);
    assert.deepEqual(save({ ...next, highlights: [...highlights].reverse() }, expected), []);
    assert.equal(save(next, expected)[0].highlights, null);
});

test("nullable cost distinguishes SQL NULL, empty text and quoted text", () => {
    assert.deepEqual(save({ ...expected, estimated_cost: "" }), []);
    const empty = { ...replacement, estimated_cost: "" };
    assert.equal(save(expected, empty)[0].estimated_cost, "");
    assert.deepEqual(save({ ...empty, estimated_cost: null }), []);
    const quoted = { ...replacement, estimated_cost: "$10 'quoted' \\" };
    assert.equal(save(empty, quoted)[0].estimated_cost, quoted.estimated_cost);
    assert.equal(save(quoted, expected)[0].estimated_cost, null);
});

test("large Korean JSONB plans save by value rather than object key order", () => {
    const activities = Array.from({ length: 56 }, (_, index) => ({ name: `\uacbd\ubcf5\uad81 ${index}`, notes: "\uc11c\uc6b8 \uc5ec\ud589 ".repeat(50), lat: 37.57, lng: 126.98 }));
    const large = { ...replacement, activities: { dailyPlans: [{ day: 1, activities }], insights: [] } };
    assert.ok(encodeURIComponent(JSON.stringify(large.activities)).length > 20_000);
    assert.deepEqual(save(expected, large)[0].activities, large.activities);
    const reordered = { ...large, activities: { insights: [], dailyPlans: [{ activities, day: 1 }] } };
    assert.equal(save(reordered, expected)[0].title, "Original");
});

for (const field of fields) {
    test(`stale ${field} returns zero rows and changes nothing`, () => {
        const stale = { ...expected, [field]: field === "activities" || field === "highlights" ? [] : "stale" };
        assert.deepEqual(save(stale), []);
        assert.equal(sql(`SELECT title FROM public.itineraries WHERE id = '${id}';`), "Original");
    });
    for (const side of ["expected", "replacement"]) {
        test(`direct RPC denies missing ${side}.${field}`, () => {
            const incomplete = { ...(side === "expected" ? expected : replacement) };
            delete incomplete[field];
            denied(session(rpc(side === "expected" ? incomplete : expected, side === "replacement" ? incomplete : replacement)), "22023");
        });
    }
}

for (const side of ["expected", "replacement"]) {
    for (const [name, malformed] of [
        ["SQL NULL", undefined], ["JSON null", null], ["array", []], ["scalar", 1],
        ["numeric title", { ...expected, title: 1 }], ["object city", { ...expected, city: {} }],
        ["numeric cost", { ...expected, estimated_cost: 10 }],
        ["string highlights", { ...expected, highlights: "{}" }],
        ["nested highlights", { ...expected, highlights: [[]] }],
        ["null highlight", { ...expected, highlights: [null] }],
        ["numeric highlight", { ...expected, highlights: [1] }],
    ]) {
        test(`direct RPC denies ${side}: ${name}`, () => {
            // Do not use rpc() defaults when testing SQL NULL arguments.
            const query = `SELECT * FROM public.save_itinerary_snapshot('${id}', ${json(side === "expected" ? malformed : expected)}, ${json(side === "replacement" ? malformed : replacement)});`;
            denied(session(query), "22023");
        });
    }
}

for (const [field, value] of [["title", null], ["city", null], ["activities", null], ["activities", 1], ["activities", "bad"], ["activities", true]]) {
    test(`direct RPC denies replacement ${field}=${JSON.stringify(value)}`, () => {
        denied(session(rpc(expected, { ...replacement, [field]: value })), "22023");
    });
}

test("direct RPC rejects a null itinerary ID", () => {
    denied(session(rpc(expected, replacement, null)), "22023");
});

test("invalid JSON fails before function execution", () => {
    denied(session(`SELECT * FROM public.save_itinerary_snapshot('${id}', '{'::jsonb, ${json(replacement)});`), "22P02");
});

test("missing itineraries return zero rows", () => {
    assert.deepEqual(save(expected, replacement, "owner", "00000000-0000-4000-8000-000000000099"), []);
});

test("expected activities preserve raw JSONB values allowed by the existing schema", () => {
    // JSON null is a non-SQL-null JSONB value allowed by activities NOT NULL.
    sql(`UPDATE public.itineraries SET activities = 'null'::jsonb WHERE id = '${id}';`);
    assert.deepEqual(save({ ...expected, activities: [] }), []);
    assert.equal(save({ ...expected, activities: null })[0].title, "Saved");
});

test("parallel writes with one snapshot produce one commit and one conflict", async () => {
    const first = asyncSql(session(`BEGIN; SET application_name = 'rpc-first'; ${rpc()} SELECT pg_sleep(1.5); COMMIT;`));
    // Observe the first transaction holding its row lock before starting the second.
    for (let attempt = 0; ; attempt++) {
        if (sql("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'rpc-first' AND wait_event = 'PgSleep';") === "1") break;
        assert.ok(attempt < 100, "First writer did not acquire its lock");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const second = asyncSql(session(`SET application_name = 'rpc-second'; ${rpc(expected, { ...replacement, title: "Second" })}`));
    for (let attempt = 0; ; attempt++) {
        if (sql("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'rpc-second' AND wait_event_type = 'Lock';") === "1") break;
        assert.ok(attempt < 100, "Second writer did not wait for the first row lock");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const [one, two] = await Promise.all([first, second]);
    assert.equal(JSON.parse(one)[0].title, "Saved");
    assert.deepEqual(JSON.parse(two), []);
    assert.equal(sql(`SELECT title FROM public.itineraries WHERE id = '${id}';`), "Saved");
});
