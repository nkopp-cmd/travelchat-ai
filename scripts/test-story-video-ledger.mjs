// Offline, disposable Postgres only. No dotenv, remote credentials, host ports, or provider calls.
// Run: node scripts/test-story-video-ledger.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const exec = promisify(execFile);
const name = `localley-video-ledger-${randomUUID()}`;
const env = { PATH: process.env.PATH, LANG: "C.UTF-8" };
const docker = async (...args) => (await exec("docker", args, { env, timeout: 120000, maxBuffer: 1024 * 1024 })).stdout.trim();
const sql = (query, role = "service_role") => docker("exec", name, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", "postgres", "-c", `SET statement_timeout='10s'; SET ROLE ${role}; ${query}`);
const q = value => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const trip = randomUUID();
const otherTrip = randomUUID();
const hash = "a".repeat(64);
const reserveSql = (key = "key", duration = 4, user = "owner", itinerary = trip, payload = hash) =>
    `SELECT public.reserve_story_video_job(${q(user)},${q(itinerary)},${q(key)},${q(payload)},
        s->>'prompt',${duration},s->>'title',s->>'caption') FROM
        (SELECT public.story_video_text_snapshot(title,city) s FROM public.itineraries WHERE id=${q(itinerary)}) preflight`;
const eligibilitySql = (user = "owner", itinerary = trip) => `SELECT public.get_story_video_eligibility(${q(user)},${q(itinerary)})`;
const eligibility = async (...args) => JSON.parse(await sql(eligibilitySql(...args))).eligibleDurations;
const reserve = async (...args) => JSON.parse(await sql(reserveSql(...args)));
const advance = async (j, action, extra = {}) => JSON.parse(await sql(`SELECT public.advance_story_video_job(
    ${q(extra.user ?? "owner")},${q(extra.itinerary ?? trip)},${q(j.job.jobId)},${q(action)},
    ${q(extra.token === undefined ? j.ownerToken : extra.token)},${q(extra.task ?? null)},
    ${q(extra.fence ?? null)},${q(extra.status ?? null)},${q(extra.url ?? null)})`));
const claim = async (j, user = "owner", itinerary = trip) => JSON.parse(await sql(
    `SELECT public.claim_story_video_poll(${q(user)},${q(itinerary)},${q(j.job.jobId)})`));
const held = async () => Number(await sql("SELECT coalesce(sum(reserve_cents),0) FROM public.story_video_jobs WHERE allocation <> 'released'"));
const config = (values = "ceiling_cents=2000,daily_cents_limit=2000,owner_daily_admissions=100,owner_active_limit=100") =>
    sql(`UPDATE public.story_video_budget SET ${values}`, "postgres");
const reset = async () => {
    await sql("TRUNCATE public.story_video_jobs", "postgres");
    await config();
};
const expire = j => sql(`UPDATE public.story_video_jobs SET deadline=now()-interval '1 second' WHERE id=${q(j.job.jobId)}`, "postgres");
const due = j => sql(`UPDATE public.story_video_jobs SET next_poll_at=now()-interval '1 second' WHERE id=${q(j.job.jobId)}`, "postgres");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let created = false;
let checks = 0;
const checked = label => { checks++; console.log(`PASS ${label}`); };
try {
    await docker("run", "--pull=never", "--detach", "--rm", "--name", name, "--network", "none", "--cpus", "0.5",
        "--memory", "384m", "--memory-swap", "384m", "--pids-limit", "128",
        "--tmpfs", "/var/lib/postgresql/data:rw,size=192m", "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
        "postgres:17-alpine", "-c", "shared_buffers=32MB", "-c", "max_connections=12");
    created = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
        // The temporary initialization server uses a socket only; wait for the final TCP listener.
        try { await docker("exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); ready = true; break; }
        catch { await sleep(500); }
    }
    assert.ok(ready);
    console.log(await sql("SELECT version()", "postgres"));
    const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
    const fixture = schema.match(/CREATE TABLE itineraries \([\s\S]*?\n\);/)?.[0];
    assert.ok(fixture, "Real itinerary schema fixture not found");
    await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE public.users (id uuid PRIMARY KEY);
        CREATE SCHEMA storage;
        CREATE TABLE storage.buckets (id text PRIMARY KEY,name text NOT NULL,public boolean DEFAULT false,
            file_size_limit bigint,allowed_mime_types text[]);
        CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA storage TO anon,authenticated;
        GRANT SELECT ON storage.objects TO anon,authenticated;
        CREATE POLICY broad_read ON storage.objects FOR SELECT TO anon,authenticated USING (true);
        ${fixture}
        INSERT INTO public.itineraries (id,clerk_user_id,city,title,days,activities)
            VALUES (${q(trip)},'owner','Seoul','Seoul trip',1,'[]'),(${q(otherTrip)},'other','Tokyo','Tokyo trip',1,'[]');
        GRANT USAGE ON SCHEMA public TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.itineraries TO service_role;
        -- Simulate older Supabase projects with broad automatic grants.
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`, "postgres");
    await sql(await readFile(new URL("../supabase/migrations/20260907064632_story_video_jobs.sql", import.meta.url), "utf8"), "postgres");
    const processingMigration = await readFile(new URL("../supabase/migrations/20260907071555_story_video_processing.sql", import.meta.url), "utf8");
    await sql("INSERT INTO storage.buckets(id,name,public) VALUES ('story-videos','story-videos',true)", "postgres");
    await assert.rejects(sql(processingMigration, "postgres"), /must be private/);
    await sql("DELETE FROM storage.buckets", "postgres");
    await sql(processingMigration, "postgres");
    await config();
    const legacy = JSON.parse(await sql(`SELECT public.reserve_story_video_job('owner',${q(trip)},'legacy',${q(hash)},'Seoul trip',4)`));
    await sql(await readFile(new URL("../supabase/migrations/20260907080754_story_video_reservation_snapshot.sql", import.meta.url), "utf8"), "postgres");
    assert.equal(await sql("SELECT render_title IS NULL AND render_caption IS NULL FROM public.story_video_jobs"), "t");
    await advance(legacy, "submit");
    await advance(legacy, "ack", { task: "legacy" });
    const legacyPoll = await claim(legacy);
    await advance(legacy, "poll", { task: "legacy", fence: legacyPoll.pollFence, status: "provider_ready", url: "https://private.example/legacy.mp4" });
    await sql(`UPDATE public.itineraries SET title='' WHERE id=${q(trip)}`, "postgres");
    await assert.rejects(sql(`SELECT public.claim_story_video_processing(${q(legacy.job.jobId)})`), /Missing owned itinerary title/);
    await sql(`UPDATE public.itineraries SET title='Legacy current title' WHERE id=${q(trip)}`, "postgres");
    assert.equal(JSON.parse(await sql(`SELECT public.claim_story_video_processing(${q(legacy.job.jobId)})`)).title, "Legacy current title");
    await sql(`UPDATE public.itineraries SET title='Seoul trip' WHERE id=${q(trip)}; TRUNCATE public.story_video_jobs`, "postgres");
    await config("ceiling_cents=0,daily_cents_limit=0,owner_daily_admissions=0,owner_active_limit=0");
    checked("migration preserves genuine legacy nulls; only legacy claim reads the current title");
    await assert.rejects(reserve(), /Video limit/);
    assert.equal(await held(), 0);
    assert.equal(await sql("SELECT ceiling_cents+daily_cents_limit+owner_daily_admissions+owner_active_limit FROM public.story_video_budget"), "0");
    checked("all budget defaults zero; no admission or allocation");

    for (const value of [-1, 2001]) await assert.rejects(config(`ceiling_cents=${value}`), /check constraint/);
    for (const query of ["UPDATE public.story_video_budget SET ceiling_cents=2000", "DELETE FROM public.story_video_budget",
        "INSERT INTO public.story_video_budget DEFAULT VALUES", "TRUNCATE public.story_video_budget"]) {
        await assert.rejects(sql(query), /permission denied/);
    }
    await assert.rejects(sql("DELETE FROM public.story_video_budget", "postgres"), /cannot be deleted/);
    checked("immutable 2000-cent ceiling; service_role cannot write budget even with old default grants");

    await config();
    const first = await reserve();
    assert.match(first.ownerToken, /^[0-9a-f-]{36}$/);
    assert.equal(first.job.status, "reserved");
    assert.equal(await held(), 32);
    await config("ceiling_cents=0,daily_cents_limit=0,owner_daily_admissions=0,owner_active_limit=0");
    assert.deepEqual(await reserve(), { job: first.job, ownerToken: null });
    await assert.rejects(reserve("key", 5), /Idempotency conflict/);
    await assert.rejects(reserve("key", 4, "owner", trip, "b".repeat(64)), /Idempotency conflict/);
    checked("replay precedes limits, returns no token; payload and duration conflicts");

    await reset();
    for (const duration of [3, 7]) await assert.rejects(reserve(`duration-${duration}`, duration), /Invalid duration/);
    await assert.rejects(reserve("wrong", 4, "owner", otherTrip), /Not found/);
    const fenced = await reserve("fenced");
    await assert.rejects(claim(fenced, "other"), /Not found/);
    await assert.rejects(claim(fenced, "owner", otherTrip), /Not found/);
    await assert.rejects(advance(fenced, "submit", { token: randomUUID() }), /Invalid fence/);
    await assert.rejects(advance(fenced, "submit", { user: "other" }), /Not found/);
    for (const change of ["clerk_user_id='other'", `itinerary_id=${q(otherTrip)}`, "idempotency_key='changed'",
        `payload_hash=${q("b".repeat(64))}`, "duration=5,reserve_cents=40", "prompt='changed'", "model='other'",
        "resolution='1080P'", "ratio='16:9'", "price_revision='v2'", "reserve_cents=1"]) {
        await assert.rejects(sql(`UPDATE public.story_video_jobs SET ${change} WHERE id=${q(fenced.job.jobId)}`));
    }
    await sql(`INSERT INTO public.itineraries (id,clerk_user_id,city,title,days,activities)
        VALUES (gen_random_uuid(),'owner','Busan','Busan',1,'[]')`, "postgres");
    const sameOwnerTrip = await sql("SELECT id FROM public.itineraries WHERE city='Busan'");
    await assert.rejects(reserve("fenced", 4, "owner", sameOwnerTrip), /Idempotency conflict/);
    checked("SQL ownership, cross-itinerary keys, token fencing, immutable identity and pricing");

    await reset();
    const duplicates = await Promise.all(Array.from({ length: 4 }, () => reserve("duplicate")));
    assert.equal(duplicates.filter(j => j.ownerToken).length, 1);
    assert.equal(new Set(duplicates.map(j => j.job.jobId)).size, 1);
    assert.equal(await held(), 32);
    checked("real concurrent duplicate reservations allocate exactly once");

    await reset();
    await config("ceiling_cents=64");
    const cashRace = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => reserve(`cash-${i}`)));
    assert.equal(cashRace.filter(r => r.status === "fulfilled").length, 2);
    assert.equal(await held(), 64);
    checked("real concurrent lifetime ceiling competition");

    // Hold the singleton while independent claims complete and accounting RPCs visibly wait.
    await reset();
    const pollJobs = [await reserve("poll-a"), await reserve("poll-b")];
    for (const j of pollJobs) {
        await advance(j, "submit");
        await advance(j, "ack", { task: j.job.jobId });
    }
    const expiring = await reserve("expiring");
    await expire(expiring);
    const holder = sql("SET application_name='video-lock-holder'; BEGIN; SELECT pg_advisory_xact_lock(731905,0); SELECT pg_sleep(8); COMMIT;");
    let seen = false;
    for (let i = 0; i < 40; i++) {
        if (await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='video-lock-holder' AND wait_event='PgSleep'", "postgres") === "1") { seen = true; break; }
        await sleep(25);
    }
    assert.ok(seen);
    const waiter = sql(`SET application_name='video-lock-waiter'; ${reserveSql("waiter")}`);
    const expiryWaiter = sql(`SET application_name='video-expiry-waiter';
        SELECT public.advance_story_video_job('owner',${q(trip)},${q(expiring.job.jobId)},'expire')`);
    seen = false;
    for (let i = 0; i < 40; i++) {
        if (await sql(`SELECT count(*) FROM pg_stat_activity w
            WHERE w.application_name IN ('video-lock-waiter','video-expiry-waiter') AND w.wait_event='advisory'
                AND EXISTS (SELECT 1 FROM pg_stat_activity h WHERE h.application_name='video-lock-holder'
                    AND h.pid=ANY(pg_blocking_pids(w.pid)))`, "postgres") === "2") { seen = true; break; }
        await sleep(25);
    }
    try {
        assert.ok(seen, "Reservation and expiry must both wait behind the singleton holder");
        await sql(`SET lock_timeout='500ms'; DO $$
            DECLARE poll_job uuid; claimed jsonb;
            BEGIN
                FOREACH poll_job IN ARRAY ARRAY[${pollJobs.map(j => `${q(j.job.jobId)}::uuid`).join(",")}] LOOP
                    claimed := public.claim_story_video_poll('owner',${q(trip)},poll_job);
                    ASSERT claimed->>'pollFence' IS NOT NULL, 'Independent job must claim without the budget lock';
                    ASSERT claimed->>'taskId' = poll_job::text, 'Claim must preserve task identity';
                END LOOP;
                ASSERT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
                    WHERE a.application_name='video-lock-holder' AND l.locktype='advisory'
                        AND l.classid=731905 AND l.objid=0 AND l.objsubid=2 AND l.granted),
                    'Global budget lock must still be held after both claims';
            END $$;`);
        assert.equal(await held(), 96, "Blocked expiry must not release funds");
        assert.deepEqual(JSON.parse(await sql(`SET lock_timeout='500ms'; ${eligibilitySql()}`)).eligibleDurations, [4,5,6]);
    } finally {
        await Promise.all([holder, waiter, expiryWaiter]);
    }
    assert.equal(await held(), 96, "After unlock, one reservation replaces the expired allocation");
    assert.equal((await claim(expiring)).job.errorCode, "reservation_expired");
    checked("independent polls bypass held budget lock; reservation and expiry visibly block behind it");

    for (const setting of ["ceiling_cents", "daily_cents_limit", "owner_daily_admissions", "owner_active_limit"]) {
        await reset();
        await config(`${setting}=0`);
        await assert.rejects(reserve(), /Video limit/);
        assert.equal(await held(), 0);
    }
    checked("each zero limit independently blocks admissions");

    await reset();
    for (const [settings, expected] of [["ceiling_cents=31", []], ["ceiling_cents=32", [4]],
        ["ceiling_cents=40", [4,5]], ["ceiling_cents=48", [4,5,6]], ["daily_cents_limit=39", [4]],
        ["owner_daily_admissions=0", []], ["owner_daily_admissions=100,owner_active_limit=0", []]]) {
        await config(settings);
        const before = await sql("SELECT row_to_json(b) FROM public.story_video_budget b");
        assert.deepEqual(await eligibility(), expected);
        assert.equal(await sql("SELECT count(*) FROM public.story_video_jobs"), "0");
        assert.equal(await sql("SELECT row_to_json(b) FROM public.story_video_budget b"), before);
    }
    await assert.rejects(eligibility("other"), /Not found/);
    checked("read-only eligibility returns exact duration boundaries, owner checks, no inserts or budget writes");

    await reset();
    const preflight = JSON.parse(await sql(`SELECT public.story_video_text_snapshot(title,city) FROM public.itineraries WHERE id=${q(trip)}`));
    const staleReserve = `SELECT public.reserve_story_video_job('owner',${q(trip)},'stale',${q(hash)},${q(preflight.prompt)},4,${q(preflight.title)},${q(preflight.caption)})`;
    for (const change of ["title='Changed title'", "city='Busan'"]) {
        await sql(`UPDATE public.itineraries SET ${change} WHERE id=${q(trip)}`, "postgres");
        await assert.rejects(sql(staleReserve), /Owned story text changed/);
        assert.equal(await held(), 0);
        await sql(`UPDATE public.itineraries SET title='Seoul trip',city='Seoul' WHERE id=${q(trip)}`, "postgres");
    }
    await assert.rejects(sql(staleReserve.replace(q(preflight.prompt), "'forged prompt'")), /Owned story text changed/);
    await assert.rejects(sql(staleReserve.replace(q(preflight.caption), "NULL")), /Owned story text changed/);
    checked("changed server text, prompt metadata, and missing snapshot reject before reservation");

    for (const [change, error] of [["title='Concurrent title'", /Owned story text changed/],
        ["clerk_user_id='other'", /Not found/]]) {
        const editor = sql(`SET application_name='video-itinerary-editor'; BEGIN;
            UPDATE public.itineraries SET ${change} WHERE id=${q(trip)}; SELECT pg_sleep(2); COMMIT;`, "postgres");
        let editing = false;
        for (let i = 0; i < 40; i++) {
            if (await sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='video-itinerary-editor' AND wait_event='PgSleep'", "postgres") === "1") {
                editing = true; break;
            }
            await sleep(25);
        }
        assert.ok(editing);
        const waiting = sql(`SET application_name='video-snapshot-waiter'; ${staleReserve}`);
        const rejection = assert.rejects(waiting, error);
        let blocked = false;
        for (let i = 0; i < 40; i++) {
            if (await sql(`SELECT count(*) FROM pg_stat_activity w WHERE application_name='video-snapshot-waiter'
                AND EXISTS (SELECT 1 FROM pg_stat_activity e WHERE e.application_name='video-itinerary-editor'
                    AND e.pid=ANY(pg_blocking_pids(w.pid)))`, "postgres") === "1") { blocked = true; break; }
            await sleep(25);
        }
        await Promise.all([editor,rejection]);
        assert.ok(blocked, "Reservation must wait for the itinerary transaction");
        assert.equal(await held(), 0);
        await sql(`UPDATE public.itineraries SET title='Seoul trip',clerk_user_id='owner' WHERE id=${q(trip)}`, "postgres");
    }
    checked("concurrent text and ownership edits block reservation then reject stale preflight without money allocation");
    await sql("BEGIN; TRUNCATE public.story_video_budget; DO $$ BEGIN PERFORM public.get_story_video_eligibility('owner'," +
        q(trip) + "); RAISE EXCEPTION 'Unexpected eligibility'; EXCEPTION WHEN raise_exception THEN " +
        "IF SQLERRM <> 'Video budget unavailable' THEN RAISE; END IF; END $$; ROLLBACK;", "postgres");
    checked("missing budget singleton fails unavailable, never reports eligible or not-found");

    const textBatch = [
        { title: " \nSeoul trip\t", city: " \nSeoul\t" },
        { title: "\uC11C\uC6B8 \uACE8\uBAA9", city: "\uC11C\uC6B8" },
        { title: "T".repeat(201), city: "C".repeat(101) },
        { title: "Quiet\nalleys", city: "" },
        { title: "\u3000Quiet alleys\u00a0", city: "Seoul https://example.test/private" },
    ];
    for (const [index, raw] of textBatch.entries()) {
        const title = raw.title.trim().slice(0,200);
        const city = raw.city.trim().slice(0,100);
        const caption = `${city ? `${city} - ` : ""}AI-generated travel scene`;
        const clean = text => text.replace(/https?:\/\/\S+/gi, "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
        const prompt = `Create a short cinematic travel scene. City: ${clean(city)}. Trip: ${clean(title)}. Vertical composition, natural motion, no text or logos.`;
        await sql(`UPDATE public.itineraries SET title=${q(raw.title)},city=${q(raw.city)} WHERE id=${q(trip)}`, "postgres");
        const j = JSON.parse(await sql(`SELECT public.reserve_story_video_job('owner',${q(trip)},'batch-${index}',${q(hash)},${q(prompt)},4,${q(title)},${q(caption)})`));
        assert.deepEqual(JSON.parse(await sql(`SELECT jsonb_build_object('title',render_title,'caption',render_caption,'prompt',prompt)
            FROM public.story_video_jobs WHERE id=${q(j.job.jobId)}`)), { title,caption,prompt });
    }
    await assert.rejects(sql(`INSERT INTO public.story_video_jobs(clerk_user_id,itinerary_id,idempotency_key,payload_hash,prompt,duration,reserve_cents)
        VALUES('owner',${q(trip)},'no-snapshot',${q(hash)},'prompt',4,32)`), /Initial render snapshot required/);
    await sql(`UPDATE public.itineraries SET title='Seoul trip',city='Seoul' WHERE id=${q(trip)}`, "postgres");
    checked("snapshot batch matches server trim, bounds, Korean, prompt sanitization, and disclosure; inserts cannot omit snapshot");

    for (const [setting, max] of [["daily_cents_limit=48", 1], ["owner_daily_admissions=2", 2], ["owner_active_limit=1", 1]]) {
        await reset();
        await config(setting);
        const race = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => reserve(`limit-${i}`)));
        assert.equal(race.filter(r => r.status === "fulfilled").length, max);
        checked(`concurrent ${setting}`);
    }

    await reset();
    await config("owner_daily_admissions=1");
    const expired = await reserve("expired");
    assert.equal((await advance(expired, "expire")).status, "reserved");
    await expire(expired);
    await assert.rejects(advance(expired, "submit"), /Not submit-ready/);
    await Promise.all([advance(expired, "expire"), advance(expired, "expire")]);
    assert.equal(await held(), 0);
    assert.equal((await reserve("expired")).job.errorCode, "reservation_expired");
    await assert.rejects(reserve("new"), /Video limit/);
    await assert.rejects(advance(expired, "submit"), /Not submit-ready/);
    checked("only expired reserved releases once; daily admissions still count released jobs");

    await reset();
    for (const action of ["unknown", "reject"]) {
        const j = await reserve(action);
        await advance(j, "submit");
        await assert.rejects(advance(j, "submit"), /Not submit-ready/);
        await advance(j, action);
        await expire(j);
        const result = await advance(j, "expire");
        assert.equal(result.status, action === "unknown" ? "submission_unknown" : "failed");
        assert.equal((await claim(j)).pollFence, null);
    }
    const lostAck = await reserve("lost-ack");
    await advance(lostAck, "submit");
    await expire(lostAck);
    assert.equal((await advance(lostAck, "expire")).status, "submitting");
    assert.equal((await claim(lostAck)).job.errorCode, "requires_review");
    assert.equal(await held(), 96);
    checked("unknown, rejection, and missing acknowledgement retain all funds; no resubmission");

    await reset();
    const a = await reserve("a");
    const b = await reserve("b");
    await advance(a, "submit");
    await advance(b, "submit");
    await advance(a, "ack", { task: "provider-task" });
    await assert.rejects(advance(b, "ack", { task: "provider-task" }), /unique constraint/);
    assert.equal((await claim(b)).job.status, "submitting");
    assert.equal(await held(), 64);
    checked("provider task IDs unique; failed acknowledgement rolls back without releasing cash");

    const claims = await Promise.all(Array.from({ length: 4 }, () => claim(a)));
    assert.equal(claims.filter(c => c.pollFence).length, 1);
    const c1 = claims.find(c => c.pollFence);
    assert.equal((await claim(a)).pollFence, null);
    assert.ok(Number(await sql(`SELECT extract(epoch FROM next_poll_at-clock_timestamp()) FROM public.story_video_jobs WHERE id=${q(a.job.jobId)}`)) > 8);
    await assert.rejects(advance(a, "poll", { task: "wrong", fence: c1.pollFence, status: "running" }), /Invalid poll fence/);
    await due(a);
    const c2 = await claim(a);
    await assert.rejects(advance(a, "poll", { task: "provider-task", fence: c1.pollFence, status: "running" }), /Invalid poll fence/);
    await advance(a, "poll", { task: "provider-task", fence: c2.pollFence, status: "running" });
    await due(a);
    const c3 = await claim(a);
    assert.equal((await advance(a, "poll", { task: "provider-task", fence: c3.pollFence, status: "queued" })).status, "running");
    checked("ten-second cross-caller poll claim, stale fences, task identity, monotone running state");

    await due(a);
    const readyClaim = await claim(a);
    const readyJob = await advance(a, "poll", { task: "provider-task", fence: readyClaim.pollFence,
        status: "provider_ready", url: "https://private.example/video.mp4?secret=hidden" });
    assert.equal(readyJob.status, "provider_ready");
    assert.ok(!JSON.stringify(readyJob).includes("secret"));
    assert.equal((await claim(a)).pollFence, null);
    assert.equal(await sql(`SELECT allocation FROM public.story_video_jobs WHERE id=${q(a.job.jobId)}`), "consumed");
    await assert.rejects(advance(a, "poll", { task: "provider-task", fence: readyClaim.pollFence, status: "running" }), /Invalid poll fence/);
    await expire(a);
    await advance(a, "expire");
    assert.equal(await held(), 64);
    checked("provider_ready is terminal, private URL stays private, consumed funds never refunded");

    await reset();
    for (const status of ["failed", "cancelled", "submission_unknown"]) {
        const j = await reserve(status);
        await advance(j, "submit");
        await advance(j, "ack", { task: status });
        const c = await claim(j);
        await advance(j, "poll", { task: status, fence: c.pollFence, status });
        await expire(j);
        await advance(j, "expire");
        assert.equal((await claim(j)).pollFence, null);
    }
    assert.equal(await held(), 96);
    checked("provider failure, cancellation, and metadata review are terminal but remain allocated");

    await reset();
    await config("owner_daily_admissions=1,owner_active_limit=1");
    await reserve("one-owner");
    await reserve("one-owner", 4, "other", otherTrip);
    assert.equal(await held(), 64);
    await assert.rejects(reserve("two-owner"), /Video limit/);
    checked("owner limits are isolated while cash allocations remain global");

    await reset();
    await config("ceiling_cents=32,daily_cents_limit=32");
    const yesterday = await reserve("yesterday");
    // Time-travel only this isolated fixture; production identity timestamps are immutable.
    await sql(`ALTER TABLE public.story_video_jobs DISABLE TRIGGER story_video_identity;
        UPDATE public.story_video_jobs SET created_at=created_at-interval '1 day';
        ALTER TABLE public.story_video_jobs ENABLE TRIGGER story_video_identity;`, "postgres");
    await assert.rejects(reserve("today"), /Video limit/);
    await config("ceiling_cents=64");
    await reserve("today");
    assert.equal(await held(), 64);
    await sql(`DELETE FROM public.itineraries WHERE id=${q(trip)}`, "postgres");
    assert.equal(await held(), 64);
    await assert.rejects(claim(yesterday), /Not found/);
    checked("midnight resets daily only, lifetime persists, itinerary deletion preserves accounting");

    for (const role of ["anon", "authenticated"]) {
        for (const query of ["SELECT * FROM public.story_video_budget", "SELECT * FROM public.story_video_jobs",
            reserveSql(), `SELECT public.claim_story_video_poll('owner',${q(trip)},${q(yesterday.job.jobId)})`,
            `SELECT public.advance_story_video_job('owner',${q(trip)},${q(yesterday.job.jobId)},'expire')`,
            "UPDATE public.story_video_jobs SET status='failed'", "DELETE FROM public.story_video_jobs"]) {
            await assert.rejects(sql(query, role), /permission denied/);
        }
    }
    await assert.rejects(sql("DELETE FROM public.story_video_jobs"), /permission denied/);
    await assert.rejects(sql("TRUNCATE public.story_video_jobs"), /permission denied/);
    assert.equal(await sql("SELECT count(*) FROM pg_proc WHERE proname LIKE '%story_video%' AND prosecdef", "postgres"), "0");
    assert.equal(await sql("SELECT count(*) FROM pg_class WHERE relname IN ('story_video_jobs','story_video_budget') AND relrowsecurity", "postgres"), "2");
    checked("RLS, SECURITY INVOKER, anonymous/authenticated denial, service_role cannot delete ledger");
    await sql(`INSERT INTO public.itineraries(id,clerk_user_id,city,title,days,activities)
        VALUES (${q(trip)},'owner','Seoul','Seoul trip',1,'[]')`, "postgres");
    await reset();
    const renderClaim = j => sql(`SELECT public.claim_story_video_processing(${q(j.job.jobId)})`).then(value => value ? JSON.parse(value) : null);
    const finish = (c, overrides = {}) => sql(`SELECT public.finish_story_video_processing(${q(c.jobId)},
        ${q(overrides.token ?? c.token)},${q(overrides.key ?? c.outputKey)},${q(overrides.hash ?? hash)},${overrides.bytes ?? 20})`).then(JSON.parse);
    const renderExpire = c => sql(`UPDATE public.story_video_jobs SET processing_lease_until=now()-interval '1 second' WHERE id=${q(c.jobId)}`, "postgres");
    const renderFail = c => sql(`SELECT public.fail_story_video_processing(${q(c.jobId)},${q(c.token)})`);
    const delivery = (j, user = "owner", itinerary = trip) => sql(`SELECT public.get_story_video_delivery(${q(user)},${q(itinerary)},${q(j.job.jobId)})`).then(JSON.parse);
    const providerReady = async key => {
        const j = await reserve(key);
        await advance(j, "submit");
        await advance(j, "ack", { task: key });
        const c = await claim(j);
        await advance(j, "poll", { task: key, fence: c.pollFence, status: "provider_ready", url: "https://private.example/stored.mp4" });
        return j;
    };
    const rendered = await providerReady("rendered");
    await assert.rejects(delivery(rendered), /Not found/);
    assert.equal(await sql("SELECT render_title FROM public.story_video_jobs"), "Seoul trip");
    for (const change of ["render_title='Changed'", "render_caption='Changed'", "render_title=NULL,render_caption=NULL"]) {
        await assert.rejects(sql(`UPDATE public.story_video_jobs SET ${change}`), /Immutable render identity/);
    }
    await sql(`UPDATE public.itineraries SET title='' WHERE id=${q(trip)}`, "postgres");
    assert.equal(await sql("SELECT processing_attempts FROM public.story_video_jobs"), "0");
    const renderRace = await Promise.all(Array.from({ length: 4 }, () => renderClaim(rendered)));
    assert.equal(renderRace.filter(Boolean).length, 1);
    const r1 = renderRace.find(Boolean);
    assert.equal(r1.title, "Seoul trip");
    assert.equal(r1.caption, "Seoul - AI-generated travel scene");
    assert.equal(r1.outputKey, `${r1.jobId}/${r1.token}.mp4`);
    assert.ok(Number(await sql("SELECT extract(epoch FROM processing_lease_until-clock_timestamp()) FROM public.story_video_jobs")) > 890);
    await sql(`UPDATE public.itineraries SET title='Trusted title',city='Busan' WHERE id=${q(trip)}`, "postgres");
    checked("private bucket rejects public configuration; initial immutable snapshot ignores late empty title; concurrent render lease");
    await renderExpire(r1);
    await assert.rejects(finish(r1), /Expired render fence/);
    const r2 = await renderClaim(rendered);
    assert.equal(r2.attempt, 2);
    assert.notEqual(r1.token, r2.token);
    assert.equal(r2.providerUrl, r1.providerUrl);
    assert.equal(r2.title, r1.title);
    assert.equal(r2.caption, r1.caption);
    await assert.rejects(finish(r1), /Invalid render fence/);
    await assert.rejects(renderFail(r1), /Expired render fence/);
    for (const overrides of [{ key: `${r2.jobId}/other.mp4` }, { hash: "bad" }, { bytes: 0 }, { bytes: 33554433 }]) {
        await assert.rejects(finish(r2, overrides), /Invalid render fence/);
    }
    await assert.rejects(sql(`UPDATE public.story_video_jobs SET output_object_key='other' WHERE id=${q(r2.jobId)}`), /Immutable render identity/);
    const delivered = await finish(r2);
    assert.deepEqual(await finish(r2), delivered);
    assert.equal(delivered.downloadUrl, `${delivered.statusUrl}/download`);
    assert.ok(!JSON.stringify(delivered).includes(r2.token));
    assert.deepEqual(await delivery(rendered), { jobId: r2.jobId, token: r2.token, outputKey: r2.outputKey });
    await assert.rejects(delivery(rendered, "other"), /Not found/);
    await assert.rejects(delivery(rendered, "owner", otherTrip), /Not found/);
    await assert.rejects(finish(r2, { bytes: 21 }), /Expired render fence/);
    assert.equal(await renderClaim(rendered), null);
    checked("expired reclaim preserves source, old worker fenced, bounded artifact, idempotent settlement, owner-only delivery");
    const capped = await providerReady("capped");
    for (let attempt = 1; attempt <= 3; attempt++) {
        const c = await renderClaim(capped);
        assert.equal(c.attempt, attempt);
        if (attempt < 3) await renderFail(c); else await renderExpire(c);
    }
    assert.equal(await renderClaim(capped), null);
    assert.equal(await renderClaim(capped), null);
    assert.equal((await claim(capped)).job.status, "processing_failed");
    assert.equal(await held(), 64);
    assert.equal(await sql("SELECT count(*) FROM public.story_video_jobs WHERE allocation='consumed'"), "2");
    checked("three local attempts maximum, expired final lease fails, no provider retry or cash release");
    await config("owner_active_limit=1");
    assert.deepEqual(await eligibility(), [4,5,6], "Delivered and processing_failed do not consume active capacity");
    const backlog = await providerReady("backlog");
    assert.deepEqual(await eligibility(), []);
    await assert.rejects(reserve("backlog-blocked"), /Video limit/);
    await renderClaim(backlog);
    assert.deepEqual(await eligibility(), []);
    await assert.rejects(reserve("processing-blocked"), /Video limit/);
    assert.deepEqual(await eligibility("other",otherTrip), [4,5,6]);
    checked("provider_ready and processing consume owner capacity; finished and terminal render jobs do not");
    await sql(`UPDATE public.itineraries SET clerk_user_id='other' WHERE id=${q(trip)}`, "postgres");
    await assert.rejects(delivery(rendered), /Not found/);
    await assert.rejects(delivery(rendered, "other"), /Not found/);
    await assert.rejects(renderClaim(capped), /Missing owned itinerary title/);
    await sql(`DELETE FROM public.itineraries WHERE id=${q(trip)}`, "postgres");
    await assert.rejects(delivery(rendered), /Not found/);
    assert.equal(await held(), 96);
    assert.equal(await sql("SELECT public FROM storage.buckets WHERE id='story-videos'", "postgres"), "f");
    await sql("INSERT INTO storage.objects(bucket_id,name) VALUES ('story-videos','private'),('other','readable')", "postgres");
    for (const role of ["anon", "authenticated"]) {
        assert.equal(await sql("SELECT name FROM storage.objects", role), "readable");
        for (const query of [`SELECT public.claim_story_video_processing(${q(r2.jobId)})`,
            eligibilitySql(),
            `SELECT public.fail_story_video_processing(${q(r2.jobId)},${q(r2.token)})`,
            `SELECT public.finish_story_video_processing(${q(r2.jobId)},${q(r2.token)},${q(r2.outputKey)},${q(hash)},20)`,
            `SELECT public.get_story_video_delivery('owner',${q(trip)},${q(r2.jobId)})`]) {
            await assert.rejects(sql(query, role), /permission denied/);
        }
    }
    checked("ownership transfer and deletion revoke delivery; private storage denies broad client reads; render RPCs server-only");
    console.log(`Verified ${checks} SQL integration groups.`);
} finally {
    if (created) {
        await docker("rm", "--force", name);
        console.log("Removed disposable Postgres container and its tmpfs database.");
    }
}
