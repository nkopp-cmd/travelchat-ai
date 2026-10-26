// @vitest-environment node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/app-data/backend", async (original) => ({
  ...(await original<typeof import("@/lib/app-data/backend")>()), appDataDb: () => mocks.db,
}));
import { d1Rpc } from "@/lib/app-data/d1-rpc";
import { candidateKey, manifestFingerprint, pgJsonbText } from "@/lib/app-data/d1-rpc-social";
import { withMigratedTables } from "@/lib/app-data/hybrid-client";
import { claimSocialMediaJobs, completeSocialMediaJob, failSocialMediaJob, listSocialMediaWork } from "@/lib/social-spot-media-jobs";

const SUB = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
let db: D1Sqlite;

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "d1");
  db = new D1Sqlite();
  const dir = path.resolve(__dirname, "../../migrations/app-preview");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
  db.sqlite.exec(`INSERT INTO spot_contributors (id, email, public_credit_name) VALUES ('c1', 'spotter@example.com', 'Spotter')`);
  for (const [id, platform, created] of [[SUB, "tiktok", "2026-07-01T00:00:00.000000+00:00"], [OTHER, "instagram", "2026-07-02T00:00:00+00:00"]]) {
    db.sqlite.prepare(`INSERT INTO social_spot_submissions (id, contributor_id, source_url, canonical_url, platform, status, contributor_credit, created_at)
      VALUES (?, 'c1', ?, ?, ?, 'research_pending', 'Spotter', ?)`).run(id, `https://x/${id}`, `https://x/${id}`, platform, created);
  }
  mocks.db = db;
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const rpc = (name: string, args: Record<string, unknown>) => d1Rpc(db as never, name, args);
const row = (sql: string, ...params: unknown[]) => db.sqlite.prepare(sql).get(...params) as Record<string, unknown>;
const rows = (sql: string, ...params: unknown[]) => db.sqlite.prepare(sql).all(...params) as Record<string, unknown>[];
const item = (key: string, type = "image", url = `https://cdn/${key}?sig=1`) => ({ mediaKey: key, mediaType: type, sourceUrl: url, fingerprint: `fp-${key}` });
const sync = (manifest: unknown[], token: string | null = null) => rpc("sync_social_spot_media_v1", { p_submission_id: SUB, p_manifest: manifest, p_max_attempts: 5, p_extraction_token: token });
const claim = (revision: number, limit = 1, kind: string | null = null) =>
  rpc("claim_social_spot_media_jobs_v1", { p_submission_id: SUB, p_revision: revision, p_worker_id: "w1", p_limit: limit, p_lease_seconds: 60, p_media_kind: kind });
const submission = () => row("SELECT * FROM social_spot_submissions WHERE id = ?", SUB);
const past = (sql: string) => db.sqlite.exec(sql.replaceAll("PAST", "'2020-01-01T00:00:00+00:00'"));

describe("jsonb text and fingerprints match Postgres", () => {
  it("serialises like jsonb::text (key order by length, then bytes; spaced separators)", () => {
    expect(pgJsonbText([{ fingerprint: "f", mediaType: "image", mediaKey: "k\n\"", ordinal: 0 }]))
      .toBe('[{"ordinal": 0, "mediaKey": "k\\n\\"", "mediaType": "image", "fingerprint": "f"}]');
    expect(pgJsonbText({ b: 1, a: [true, null], aa: {} })).toBe('{"a": [true, null], "b": 1, "aa": {}}');
  });

  it("empty manifest fingerprint is md5('[]') like COALESCE(jsonb_agg(...)::text, '[]')", () => {
    expect(manifestFingerprint([])).toBe(createHash("md5").update("[]").digest("hex"));
  });

  it("candidate keys follow the SQL formula, including the 1-based ordinal for empty candidates", () => {
    const md5 = (s: string) => createHash("md5").update(s).digest("hex");
    expect(candidateKey({ spotName: "  Café X ", address: "1 Road", city: "Seoul" }, 1)).toBe(md5("café x|1 road|seoul"));
    expect(candidateKey({}, 3)).toBe(md5("||" + "|ordinal:3"));
  });
});

describe("sync_social_spot_media_v1", () => {
  it("queues one job per item in a new revision and journals every table", async () => {
    const result = await sync([item("a"), item("b", "video")]);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ submission_id: SUB, revision: 1, manifest_fingerprint: manifestFingerprint([
      { mediaKey: "a", mediaType: "image", fingerprint: "fp-a" }, { mediaKey: "b", mediaType: "video", fingerprint: "fp-b" }]), item_count: 2, processing_state: "queued" }]);
    expect(rows("SELECT ordinal, media_type, state, attempt_count, max_attempts FROM social_spot_submission_media_jobs ORDER BY ordinal"))
      .toEqual([{ ordinal: 0, media_type: "image", state: "queued", attempt_count: 0, max_attempts: 5 }, { ordinal: 1, media_type: "video", state: "queued", attempt_count: 0, max_attempts: 5 }]);
    expect(rows("SELECT DISTINCT table_name FROM _journal ORDER BY 1").map((r) => r.table_name))
      .toEqual(["social_spot_submission_media", "social_spot_submission_media_jobs", "social_spot_submissions"]);
  });

  it("an empty manifest succeeds at once", async () => {
    expect((await sync([])).data).toMatchObject([{ revision: 1, item_count: 0, processing_state: "succeeded" }]);
    expect(submission().media_processing_completed_at).not.toBeNull();
  });

  it("the same identity with rotated signed URLs keeps the revision and refreshes media and job URLs", async () => {
    await sync([item("a")]);
    const again = await sync([item("a", "image", "https://cdn/a?sig=2")]);
    expect(again.data).toMatchObject([{ revision: 1, processing_state: "queued" }]);
    expect(row("SELECT source_url FROM social_spot_submission_media").source_url).toBe("https://cdn/a?sig=2");
    expect(row("SELECT source_url FROM social_spot_submission_media_jobs").source_url).toBe("https://cdn/a?sig=2");
    expect(row("SELECT count(*) AS n FROM social_spot_submission_media_jobs").n).toBe(1);
  });

  it("a changed manifest starts a new revision: old jobs cancelled, old media no longer current, finalization attempts reset", async () => {
    await sync([item("a"), item("b")]);
    db.sqlite.exec("UPDATE social_spot_submissions SET media_finalization_attempt_count = 3");
    expect((await sync([item("b"), item("c")])).data).toMatchObject([{ revision: 2, item_count: 2 }]);
    expect(rows("SELECT media_key, revision, is_current, ordinal FROM social_spot_submission_media ORDER BY media_key")).toEqual([
      { media_key: "a", revision: 1, is_current: 0, ordinal: 0 }, { media_key: "b", revision: 2, is_current: 1, ordinal: 0 }, { media_key: "c", revision: 2, is_current: 1, ordinal: 1 }]);
    expect(rows("SELECT revision, state FROM social_spot_submission_media_jobs ORDER BY revision, ordinal").map((r) => `${r.revision}:${r.state}`))
      .toEqual(["1:cancelled", "1:cancelled", "2:queued", "2:queued"]);
    expect(submission().media_finalization_attempt_count).toBe(0);
  });

  it("validates the manifest like the SQL function", async () => {
    expect((await sync([item("a"), item("a")])).error).toMatchObject({ code: "22023", message: "Media keys must be unique within a manifest" });
    expect((await sync(Array.from({ length: 36 }, (_, i) => item(`k${i}`)))).error?.code).toBe("22023");
    expect((await sync([{ mediaKey: "a", sourceUrl: "u", fingerprint: "f", mediaType: "gif" }])).error?.code).toBe("22023");
    expect((await rpc("sync_social_spot_media_v1", { p_submission_id: "33333333-3333-4333-8333-333333333333", p_manifest: [] })).error?.code).toBe("P0002");
  });
});

describe("job leases", () => {
  it("lists, claims, completes and finalizes a revision", async () => {
    await sync([item("a"), item("b", "video")]);
    expect((await rpc("list_ready_social_spot_media_work_v1", { p_limit: 3 })).data).toEqual([{ submission_id: SUB }]);
    const first = (await claim(1, 1, "image")).data as Record<string, unknown>[];
    expect(first).toMatchObject([{ submission_id: SUB, revision: 1, ordinal: 0, media_kind: "image", attempt_count: 1, max_attempts: 5 }]);
    expect(submission().media_processing_state).toBe("processing");
    const second = (await claim(1, 5)).data as Record<string, unknown>[];
    expect(second.map((j) => j.ordinal)).toEqual([1]);
    expect(first[0].claim_token).not.toBe(second[0].claim_token);

    const wrong = await rpc("complete_social_spot_media_job_v1", { p_job_id: first[0].job_id, p_claim_token: second[0].claim_token, p_result: {} });
    expect(wrong.error?.code).toBe("40001");
    const done1 = await rpc("complete_social_spot_media_job_v1", { p_job_id: first[0].job_id, p_claim_token: first[0].claim_token, p_result: { output: "x" } });
    expect(done1.data).toMatchObject([{ job_state: "succeeded", processing_state: "processing", finalized: false, succeeded_count: 1, item_count: 2 }]);
    const done2 = await rpc("complete_social_spot_media_job_v1", { p_job_id: second[0].job_id, p_claim_token: second[0].claim_token, p_result: {} });
    expect(done2.data).toMatchObject([{ processing_state: "succeeded", finalized: true, succeeded_count: 2 }]);
    expect(submission().media_processing_completed_at).not.toBeNull();
    expect((await rpc("list_ready_social_spot_media_work_v1", {})).data).toEqual([{ submission_id: SUB }]);
  });

  it("a stale revision cannot be claimed", async () => {
    await sync([item("a")]);
    expect((await claim(2)).error).toMatchObject({ code: "40001" });
  });

  it("fail: retryable -> retry_wait with backoff, non-retryable -> dead_letter on the submission", async () => {
    await sync([item("a"), item("b")]);
    const [job] = (await claim(1)).data as Record<string, unknown>[];
    const retry = await rpc("fail_social_spot_media_job_v1", { p_job_id: job.job_id, p_claim_token: job.claim_token, p_error: " boom ", p_retryable: true });
    expect(retry.data).toMatchObject([{ job_state: "retry_wait", attempt_count: 1, max_attempts: 5, processing_state: "processing" }]);
    const next = Date.parse(String((retry.data as Record<string, unknown>[])[0].next_available_at)) - Date.now();
    expect(next).toBeGreaterThan(3000); expect(next).toBeLessThanOrEqual(5000);
    expect(row("SELECT last_error FROM social_spot_submission_media_jobs WHERE id = ?", job.job_id).last_error).toBe("boom");

    const [other] = (await claim(1)).data as Record<string, unknown>[];
    const dead = await rpc("fail_social_spot_media_job_v1", { p_job_id: other.job_id, p_claim_token: other.claim_token, p_error: "bad", p_retryable: false });
    expect(dead.data).toMatchObject([{ job_state: "dead_letter", processing_state: "dead_letter", next_available_at: null }]);
    expect(submission().media_dead_letter_count).toBe(1);
  });

  it("an expired lease after the final attempt is dead-lettered on the next claim", async () => {
    await sync([item("a")]);
    await claim(1);
    past("UPDATE social_spot_submission_media_jobs SET attempt_count = max_attempts, lease_expires_at = PAST");
    expect((await claim(1)).data).toEqual([]);
    expect(row("SELECT state, last_error FROM social_spot_submission_media_jobs")).toEqual({ state: "dead_letter", last_error: "Lease expired after final attempt" });
    expect(submission().media_processing_state).toBe("dead_letter");
  });

  it("lib/social-spot-media-jobs runs unchanged on D1 through the hybrid admin client", async () => {
    await sync([item("a"), item("b", "video")]);
    const supabase = withMigratedTables({ rpc: vi.fn(), from: vi.fn() }, { role: "service" }) as never;
    const work = await listSocialMediaWork({ supabase, limit: 3 });
    expect(work.map((w) => w.id)).toEqual([SUB]);
    const jobs = await claimSocialMediaJobs({ supabase, submissionId: SUB, revision: 1, limit: 2 });
    expect(jobs.map((j) => j.mediaKind)).toEqual(["image", "video"]);
    expect(await completeSocialMediaJob({ supabase, job: jobs[0], output: "ok" })).toBe(true);
    expect(await failSocialMediaJob({ supabase, job: jobs[1], error: new Error("timeout") })).toBe("retry_wait");
  });
});

describe("finalization lease (v2)", () => {
  const finalize = () => rpc("claim_social_spot_media_finalization_v2", { p_submission_id: SUB, p_revision: 1, p_lease_seconds: 180 });
  const settle = (token: unknown, succeeded: boolean) =>
    rpc("settle_social_spot_media_finalization_v2", { p_submission_id: SUB, p_revision: 1, p_finalization_token: token, p_succeeded: succeeded });

  it("claims a succeeded revision once, backs off a failed attempt and completes a successful one", async () => {
    await sync([item("a")]);
    expect((await finalize()).data).toBeNull();
    db.sqlite.exec(`UPDATE social_spot_submission_media_jobs SET state = 'succeeded', succeeded_at = '2026-10-26T00:00:00+00:00'; UPDATE social_spot_submissions SET media_processing_state = 'succeeded' WHERE id = '${SUB}'`);
    const token = (await finalize()).data;
    expect(typeof token).toBe("string");
    expect(submission()).toMatchObject({ media_processing_state: "finalizing", media_finalization_attempt_count: 1 });
    expect((await finalize()).data).toBeNull();
    expect((await settle(token, false)).data).toBe("succeeded");
    expect(Date.parse(String(submission().media_finalization_available_at)) - Date.now()).toBeGreaterThan(25_000);
    expect((await rpc("list_ready_social_spot_media_work_v1", {})).data).toEqual([]);
    expect((await settle(token, true)).error?.code).toBe("40001");
    past("UPDATE social_spot_submissions SET media_finalization_available_at = PAST");
    const again = (await finalize()).data;
    expect((await settle(again, true)).data).toBe("completed");
    expect(submission()).toMatchObject({ media_processing_state: "completed", media_finalization_token: null });
  });

  it("after 5 attempts the submission goes to review", async () => {
    await sync([item("a")]);
    db.sqlite.exec(`UPDATE social_spot_submissions SET media_processing_state = 'succeeded', media_finalization_attempt_count = 5 WHERE id = '${SUB}'`);
    expect((await finalize()).data).toBeNull();
    expect(submission()).toMatchObject({ status: "needs_review", media_processing_state: "review_required" });
  });
});

describe("coverage retries and legacy backfill", () => {
  it("defers incomplete coverage, claims the retry and syncs with the extraction token", async () => {
    const deferred = await rpc("defer_social_spot_media_coverage_v1", { p_submission_id: SUB, p_extracted_count: 1, p_expected_count: 3, p_reason: "partial" });
    expect(deferred.data).toMatchObject([{ processing_state: "coverage_retry", attempt_count: 1 }]);
    const token = (await rpc("claim_social_spot_media_coverage_v1", { p_submission_id: SUB, p_lease_seconds: 60 })).data;
    expect(typeof token).toBe("string");
    expect((await rpc("claim_social_spot_media_coverage_v1", { p_submission_id: SUB })).data).toBeNull();
    expect((await sync([item("a")])).error?.code).toBe("40001");
    expect((await sync([item("a")], token as string)).data).toMatchObject([{ revision: 1, processing_state: "queued" }]);
    expect(submission().media_extraction_token).toBeNull();
    const blocked = await rpc("defer_social_spot_media_coverage_v1", { p_submission_id: SUB, p_extracted_count: 0, p_expected_count: 1, p_reason: "x" });
    expect(blocked.error).toMatchObject({ code: "40001", message: "Active media work cannot be replaced by incomplete coverage" });
  });

  it("the fifth deferral requires review and second retries back off", async () => {
    const defer = () => rpc("defer_social_spot_media_coverage_v1", { p_submission_id: SUB, p_extracted_count: 0, p_expected_count: 2, p_reason: "none" });
    await defer();
    const second = (await defer()).data as Record<string, unknown>[];
    expect(Date.parse(String(second[0].available_at)) - Date.now()).toBeGreaterThan(8000);
    for (let i = 0; i < 3; i++) await defer();
    expect(submission()).toMatchObject({ media_processing_state: "review_required", media_extraction_attempt_count: 5, media_extraction_available_at: null });
  });

  it("schedules only explicit not-started legacy submissions before the cutoff", async () => {
    const schedule = (extra: Record<string, unknown>) => rpc("schedule_legacy_social_spot_media_backfill_v1", {
      p_submission_ids: [SUB, OTHER], p_cutoff: "2026-07-03T00:00:00Z", p_limit: 5, p_include_instagram: false, p_include_resolved: false, ...extra });
    expect((await schedule({})).data).toEqual([{ submission_id: SUB }]);
    expect(submission().media_processing_state).toBe("coverage_retry");
    expect((await schedule({ p_include_instagram: true })).data).toEqual([{ submission_id: OTHER }]);
    expect((await schedule({ p_cutoff: "2999-01-01T00:00:00Z" })).error?.code).toBe("22023");
  });
});

describe("sync_social_submission_candidates_v1", () => {
  it("upserts the current set and removes obsolete unresolved candidates only", async () => {
    const set = (candidates: unknown[]) => rpc("sync_social_submission_candidates_v1", { p_submission_id: SUB, p_candidates: candidates });
    expect((await set([{ spotName: "A", city: "Seoul" }, { spotName: "B", city: "Seoul", status: "needs_review" }])).data).toBe(2);
    expect((await set([{ spotName: "A", city: "Seoul" }])).data).toBe(2);
    expect(rows("SELECT ordinal, status FROM social_spot_submission_candidates")).toEqual([{ ordinal: 0, status: "research_pending" }]);
    expect((await set([{ spotName: "Dup" }, { spotName: "dup" }])).error?.code).toBe("21000");
  });
});
