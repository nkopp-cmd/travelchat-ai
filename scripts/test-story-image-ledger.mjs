// Local-only integration harness: no dotenv, remote credentials, published ports, or existing databases.
// Run: node scripts/test-story-image-ledger.mjs
// Recovery: call reconcile_story_image_job(user,key) once per expired reserved job.
// Submitted jobs past deadline require manual provider/storage review. Never replay them.
// Use settle_story_image_job with the recorded token only after confirming success or failure.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const exec = promisify(execFile);
const name = `localley-image-ledger-${randomUUID()}`;
const env = { PATH: process.env.PATH, LANG: "C.UTF-8" };
const docker = async (...args) => (await exec("docker", args, { env, timeout: 120000, maxBuffer: 1024 * 1024 })).stdout.trim();
const sql = (query, role = "service_role") => docker("exec", name, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres",
    "-d", "postgres", "-c", `SET statement_timeout='10s'; SET ROLE ${role}; ${query}`);
const quote = value => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const prefix = "https://localley.io/storage/story-backgrounds/v3/test/background.";
const payload = "a".repeat(64);
const reserveSql = (user, key = "key", credits = 3, limit = 10, hash = payload) =>
    `SELECT public.reserve_story_image_job(${quote(user)},${quote(key)},${quote(hash)},'gemini',${credits},${limit},${quote(prefix)})`;
const reserve = async (...args) => JSON.parse(await sql(reserveSql(...args)));
const submit = (user, token, key = "key") => sql(`SELECT public.submit_story_image_job(${quote(user)},${quote(key)},${quote(token)})`);
const settle = (user, token, url = null, key = "key") => sql(`SELECT public.settle_story_image_job(${quote(user)},${quote(key)},${quote(token)},${quote(url)})`);
const reconcile = user => sql(`SELECT public.reconcile_story_image_job(${quote(user)},'key')`);
const count = async user => Number(await sql(`SELECT coalesce(sum(count),0) FROM public.usage_tracking WHERE clerk_user_id=${quote(user)}`));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let created = false;
let checks = 0;
const checked = label => { checks++; console.log(`PASS ${label}`); };
try {
    await docker("run", "--detach", "--rm", "--name", name, "--network", "none", "--cpus", "0.5",
        "--memory", "384m", "--memory-swap", "384m", "--pids-limit", "128",
        "--tmpfs", "/var/lib/postgresql/data:rw,size=192m", "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
        "postgres:17-alpine", "-c", "shared_buffers=32MB", "-c", "max_connections=12");
    created = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
        try { await docker("exec", name, "pg_isready", "-U", "postgres"); ready = true; break; }
        catch { await sleep(500); }
    }
    assert.ok(ready, "Disposable Postgres did not start");
    console.log(await sql("SELECT version()", "postgres"));
    const schema = await readFile(new URL("../supabase/subscriptions-schema.sql", import.meta.url), "utf8");
    const fixture = schema.match(/CREATE TABLE IF NOT EXISTS usage_tracking \([\s\S]*?\n\);/)?.[0];
    assert.ok(fixture, "Real usage_tracking schema fixture not found");
    await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        ${fixture} ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA public TO service_role;
        GRANT SELECT, INSERT, UPDATE ON public.usage_tracking TO service_role;`, "postgres");
    await sql(await readFile(new URL("../supabase/migrations/003_weighted_usage_increment.sql", import.meta.url), "utf8"), "postgres");
    await sql(await readFile(new URL("../supabase/migrations/20260907060610_story_image_jobs.sql", import.meta.url), "utf8"), "postgres");

    const owner = await reserve("success");
    assert.match(owner.owner_token, /^[0-9a-f-]{36}$/);
    assert.equal(owner.state, "reserved");
    assert.deepEqual(await reserve("success"), { state: "reserved", owner_token: null, output_url: null });
    await submit("success", owner.owner_token);
    await assert.rejects(submit("success", owner.owner_token));
    assert.equal((await reserve("success")).state, "submitted");
    await settle("success", owner.owner_token, `${prefix}png`);
    await settle("success", owner.owner_token, `${prefix}png`);
    assert.deepEqual(await reserve("success"), { state: "succeeded", owner_token: null, output_url: `${prefix}png` });
    assert.equal(await count("success"), 3);
    await assert.rejects(settle("success", owner.owner_token));
    checked("success, token-free duplicates, submission fence, settlement replay");

    const failed = await reserve("failed");
    await submit("failed", failed.owner_token);
    await Promise.all([settle("failed", failed.owner_token), settle("failed", failed.owner_token)]);
    assert.equal(await count("failed"), 0);
    assert.equal((await reserve("failed")).state, "failed");
    assert.equal(await count("failed"), 0);
    checked("concurrent failure refunds exactly once; failed key is terminal");

    await assert.rejects(reserve("success", "key", 3, 10, "b".repeat(64)));
    await assert.rejects(reserve("success", "key", 2));
    const fenced = await reserve("fenced");
    await assert.rejects(submit("fenced", randomUUID()));
    await assert.rejects(settle("fenced", randomUUID()));
    await assert.rejects(settle("other-owner", fenced.owner_token));
    await assert.rejects(settle("fenced", fenced.owner_token, `${prefix}png`));
    await submit("fenced", fenced.owner_token);
    await assert.rejects(settle("fenced", fenced.owner_token, "https://evil.test/image.png"));
    assert.equal(await count("fenced"), 3);
    checked("payload/credit mismatch, stale tokens, owner fencing, controlled output");

    const duplicates = await Promise.all(Array.from({ length: 4 }, () => reserve("duplicate")));
    assert.equal(duplicates.filter(result => result.owner_token !== null).length, 1);
    assert.equal(await count("duplicate"), 3);
    const limits = await Promise.all(Array.from({ length: 4 }, (_, i) => reserve("limit", `key-${i}`, 3, 5)));
    assert.equal(limits.filter(result => result.state === "reserved").length, 1);
    assert.equal(await count("limit"), 3);
    checked("real concurrent duplicates and competing credit limit");

    // Observe actual lock waits, not merely simultaneous JavaScript promises.
    const weighted = sql(`SET application_name='ledger-weighted-holder'; BEGIN;
        SELECT * FROM public.check_and_increment_usage_weighted('mixed','ai_images_generated','monthly',5,3);
        SELECT pg_sleep(2); COMMIT;`);
    let holderSeen = false;
    for (let i = 0; i < 30; i++) {
        if (await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='ledger-weighted-holder' AND wait_event='PgSleep'", "postgres") === "1") {
            holderSeen = true; break;
        }
        await sleep(25);
    }
    assert.ok(holderSeen, "Weighted transaction must hold the lock");
    const competitor = sql(`SET application_name='ledger-reserve-waiter'; ${reserveSql("mixed", "key", 3, 5)}`);
    let waitSeen = false;
    for (let i = 0; i < 30; i++) {
        if (await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='ledger-reserve-waiter' AND wait_event='advisory'", "postgres") === "1") {
            waitSeen = true; break;
        }
        await sleep(25);
    }
    await weighted;
    assert.equal(JSON.parse(await competitor).state, "limit");
    assert.ok(waitSeen, "Reservation must wait on the existing weighted RPC advisory lock");
    assert.equal(await count("mixed"), 3);
    checked("mixed weighted RPC/reservation sharing observed advisory lock");

    const refundOwner = await reserve("mixed-refund");
    await submit("mixed-refund", refundOwner.owner_token);
    const incrementDuringRefund = sql(`BEGIN;
        SELECT * FROM public.check_and_increment_usage_weighted('mixed-refund','ai_images_generated','monthly',10,2);
        SELECT pg_sleep(0.3); COMMIT;`);
    await Promise.all([incrementDuringRefund, settle("mixed-refund", refundOwner.owner_token)]);
    assert.equal(await count("mixed-refund"), 2);
    checked("concurrent refund and weighted increment preserve unrelated credits");

    const cross = await reserve("cross-month");
    await submit("cross-month", cross.owner_token);
    // Move only this disposable fixture to the previous month, simulating a month boundary.
    await sql(`UPDATE public.story_image_jobs SET period_start=(date_trunc('month',CURRENT_DATE)-interval '1 month')::date WHERE clerk_user_id='cross-month';
        UPDATE public.usage_tracking SET period_start=(date_trunc('month',CURRENT_DATE)-interval '1 month')::date WHERE clerk_user_id='cross-month';
        SELECT * FROM public.check_and_increment_usage_weighted('cross-month','ai_images_generated','monthly',10,2);`, "postgres");
    await settle("cross-month", cross.owner_token);
    assert.equal(await sql("SELECT count FROM public.usage_tracking WHERE clerk_user_id='cross-month' AND period_start=date_trunc('month',CURRENT_DATE)::date"), "2");
    assert.equal(await sql("SELECT count FROM public.usage_tracking WHERE clerk_user_id='cross-month' AND period_start<date_trunc('month',CURRENT_DATE)::date"), "0");
    checked("refund goes to original month only");

    const expired = await reserve("expired");
    assert.equal(JSON.parse(await reconcile("expired")).state, "reserved");
    await sql("UPDATE public.story_image_jobs SET deadline=now()-interval '1 second' WHERE clerk_user_id='expired'", "postgres");
    await assert.rejects(submit("expired", expired.owner_token));
    await Promise.all([reconcile("expired"), reconcile("expired")]);
    assert.equal(await count("expired"), 0);
    assert.equal((await reserve("expired")).state, "failed");
    await assert.rejects(submit("expired", expired.owner_token));
    await assert.rejects(settle("expired", expired.owner_token, `${prefix}png`));
    const uncertain = await reserve("uncertain");
    await submit("uncertain", uncertain.owner_token);
    await sql("UPDATE public.story_image_jobs SET deadline=now()-interval '1 hour' WHERE clerk_user_id='uncertain'", "postgres");
    assert.equal(JSON.parse(await reconcile("uncertain")).state, "submitted");
    assert.equal(await count("uncertain"), 3);
    checked("expired reserved recovery; expired submitted remains charged and pending");

    // Failure after weighted increment must roll back both the increment and insertion.
    await sql(`CREATE FUNCTION public.reject_test_job() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.clerk_user_id='rollback' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_test_job BEFORE INSERT ON public.story_image_jobs FOR EACH ROW EXECUTE FUNCTION public.reject_test_job();`, "postgres");
    await assert.rejects(reserve("rollback"));
    assert.equal(await count("rollback"), 0);
    assert.equal(await sql("SELECT count(*) FROM public.story_image_jobs WHERE clerk_user_id='rollback'"), "0");
    const inconsistent = await reserve("inconsistent");
    await sql("UPDATE public.usage_tracking SET count=0 WHERE clerk_user_id='inconsistent'", "postgres");
    await assert.rejects(settle("inconsistent", inconsistent.owner_token));
    assert.equal((await reserve("inconsistent")).state, "reserved");
    checked("reserve atomic rollback and inconsistent refund fails closed");

    for (const role of ["anon", "authenticated"]) {
        for (const query of [reserveSql("denied"), "SELECT * FROM public.story_image_jobs",
            `SELECT public.submit_story_image_job('success','key',${quote(owner.owner_token)})`,
            `SELECT public.settle_story_image_job('success','key',${quote(owner.owner_token)},NULL)`,
            "SELECT public.reconcile_story_image_job('expired','key')",
            "SELECT * FROM public.check_and_increment_usage_weighted('denied','ai_images_generated','monthly',10,1)"]) {
            await assert.rejects(sql(query, role), /permission denied/);
        }
    }
    assert.equal(await sql(`SELECT count(*) FROM pg_proc WHERE proname IN ('reserve_story_image_job','submit_story_image_job',
        'settle_story_image_job','reconcile_story_image_job') AND prosecdef`, "postgres"), "0");
    assert.equal(await sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.story_image_jobs'::regclass", "postgres"), "t");
    checked("anon/authenticated RPC and table denial, RLS, SECURITY INVOKER");
    console.log(`Verified ${checks} SQL integration groups.`);
} finally {
    if (created) {
        await docker("rm", "--force", name);
        console.log("Removed disposable Postgres container and its tmpfs database.");
    }
}
