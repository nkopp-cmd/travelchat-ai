import "server-only";
import { createHash } from "node:crypto";
import type { PreviewAppDataReader } from "./preview-db";
import { nowTimestamptz } from "./d1-postgrest";
import { journal, RaiseException, type Args } from "./d1-rpc-shared";

/**
 * D1 versions of the social submission media-job functions (supabase/migrations/20260710085431, 20260710105520,
 * 20260710120236). Postgres serialised them with FOR UPDATE row locks; D1 has no locks, so every write is ONE batch
 * (atomic) whose first statement is a fence on the values read before it, and the other statements only apply when
 * that fence applied. Timestamps are compared with julianday() because imported rows carry Postgres formats.
 */

type Row = Record<string, unknown>;
type Bound = string | number | null;
/** A value read back from D1, bound again unchanged (fences). */
const same = (value: unknown) => (value ?? null) as Bound;

const SUBMISSIONS = "social_spot_submissions";
const MEDIA = "social_spot_submission_media";
const JOBS = "social_spot_submission_media_jobs";
const CANDIDATES = "social_spot_submission_candidates";
const UUID_SQL = "lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_JOB_STATES = "('queued', 'leased', 'retry_wait')";
const CURRENT_MEDIA_MATCHES = `EXISTS (SELECT 1 FROM ${MEDIA} AS media WHERE media.id = job.media_id AND media.submission_id = job.submission_id
  AND media.revision = job.revision AND media.fingerprint = job.fingerprint AND media.is_current)`;
const REVIEW_SUMMARY = "Place verification could not finish after bounded retries.";

const utf8 = new TextEncoder();
const md5 = (value: string) => createHash("md5").update(value, "utf8").digest("hex");
const at = (ms: number) => new Date(ms).toISOString().replace("Z", "+00:00");
/** Postgres btrim()/trim() without a character list strip spaces only. */
const btrim = (value: string) => value.replace(/^ +| +$/g, "");
/** char_length counts characters, not UTF-16 units. */
const chars = (value: string) => [...value].length;

/** jsonb::text: keys ordered by byte length then bytes, ", " and ": " separators, JSON string escapes. */
export function pgJsonbText(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(pgJsonbText).join(", ")}]`;
  const keys = Object.keys(value as Row).sort((a, b) => {
    const left = utf8.encode(a), right = utf8.encode(b);
    if (left.length !== right.length) return left.length - right.length;
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
    return 0;
  });
  return `{${keys.map((key) => `${JSON.stringify(key)}: ${pgJsonbText((value as Row)[key])}`).join(", ")}}`;
}

/** item->>'key': NULL for a missing key or JSON null, the string itself, otherwise the jsonb text. */
function field(item: Row, key: string): string | null {
  const value = item[key];
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : pgJsonbText(value);
}

const coalesce = (...values: (string | null)[]) => values.find((value) => value !== null) ?? null;
const nullif = (value: string | null) => (value === "" ? null : value);

function requireUuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new RaiseException(`invalid input syntax for type uuid: "${String(value)}" (${name})`, "22P02");
  return value;
}

function optionalUuid(value: unknown, name: string): string | null {
  return value === null || value === undefined ? null : requireUuid(value, name);
}

function int(value: unknown, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (typeof resolved !== "number" || !Number.isSafeInteger(resolved)) throw new RaiseException(`${name} must be an integer`, "22023");
  return resolved;
}

const expired = (timestamp: unknown, now: number) => typeof timestamp !== "string" || Date.parse(timestamp) <= now;

// ---------------------------------------------------------------- manifest (sync_social_spot_media_v1)

interface ManifestItem { position: number; item: Row; mediaKey: string; mediaType: string; sourceUrl: string; fingerprint: string }

function parseManifest(manifest: unknown): ManifestItem[] {
  const value = manifest ?? [];
  if (!Array.isArray(value)) throw new RaiseException("Media manifest must be a JSON array", "22023");
  if (value.length > 35) throw new RaiseException("Media manifest cannot contain more than 35 items", "22023");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new RaiseException("Every media manifest item must be a JSON object", "22023");
    const row = item as Row;
    return {
      position: index + 1,
      item: row,
      mediaKey: btrim(coalesce(field(row, "mediaKey"), field(row, "media_key"), "") as string),
      sourceUrl: btrim(coalesce(field(row, "sourceUrl"), field(row, "source_url"), field(row, "mediaUrl"), field(row, "media_url"), field(row, "url"), "") as string),
      fingerprint: btrim(coalesce(field(row, "fingerprint"), field(row, "contentFingerprint"), field(row, "content_fingerprint"), "") as string),
      mediaType: (coalesce(nullif(field(row, "mediaType")), nullif(field(row, "media_type")), nullif(field(row, "mediaKind")), nullif(field(row, "media_kind")), "unknown") as string).toLowerCase(),
    };
  });
}

/** md5 of the ordered stable identity fields (signed CDN URLs rotate without changing the revision). */
export function manifestFingerprint(items: { mediaKey: string; mediaType: string; fingerprint: string }[]): string {
  return md5(pgJsonbText(items.map((entry, ordinal) => ({ ordinal, mediaKey: entry.mediaKey, mediaType: entry.mediaType, fingerprint: entry.fingerprint }))));
}

function checkExtractionClaim(row: Row, token: string | null, now: number) {
  if (row.media_processing_state === "coverage_processing" && (token === null || token !== row.media_extraction_token || expired(row.media_extraction_lease_expires_at, now))) {
    throw new RaiseException("Media extraction claim is stale or expired", "40001");
  }
  if (row.media_processing_state !== "coverage_processing" && token !== null) {
    throw new RaiseException("Media extraction claim no longer owns this submission", "40001");
  }
}

const SUBMISSION_ROW = `SELECT id AS submission_id, media_processing_revision AS revision, media_manifest_fingerprint AS manifest_fingerprint,
  media_item_count AS item_count, media_processing_state AS processing_state FROM ${SUBMISSIONS} WHERE id = ?`;

async function syncSocialSpotMedia(db: PreviewAppDataReader, args: Args) {
  const submissionId = requireUuid(args.p_submission_id, "p_submission_id");
  const items = parseManifest(args.p_manifest);
  const maxAttempts = int(args.p_max_attempts, 5, "max_attempts");
  if (maxAttempts < 1 || maxAttempts > 10) throw new RaiseException("max_attempts must be between 1 and 10", "22023");
  const token = optionalUuid(args.p_extraction_token, "p_extraction_token");
  if (items.some((entry) => chars(entry.mediaKey) < 1 || chars(entry.mediaKey) > 512 || chars(entry.sourceUrl) < 1 || chars(entry.sourceUrl) > 8192
      || chars(entry.fingerprint) < 1 || chars(entry.fingerprint) > 512 || !["image", "video", "unknown"].includes(entry.mediaType))) {
    throw new RaiseException("Each media item needs valid mediaKey, sourceUrl, fingerprint, and mediaType fields", "22023");
  }
  if (new Set(items.map((entry) => entry.mediaKey)).size !== items.length) throw new RaiseException("Media keys must be unique within a manifest", "22023");
  const fingerprint = manifestFingerprint(items);
  const nowMs = Date.now(), now = at(nowMs);

  const current = await db.prepare(`SELECT media_processing_revision, media_manifest_fingerprint, media_processing_state, media_extraction_token,
      media_extraction_lease_expires_at FROM ${SUBMISSIONS} WHERE id = ?`).bind(submissionId).first<Row>();
  if (!current) throw new RaiseException("Social submission does not exist", "P0002");
  checkExtractionClaim(current, token, nowMs);
  const revision = Number(current.media_processing_revision);

  if (current.media_manifest_fingerprint === fingerprint) {
    const stored = (await db.prepare(`SELECT media_key, revision, ordinal, fingerprint FROM ${MEDIA} WHERE submission_id = ? AND is_current`)
      .bind(submissionId).all<Row>()).results;
    const byKey = new Map(stored.map((row) => [row.media_key, row]));
    const mismatch = items.some((entry) => {
      const row = byKey.get(entry.mediaKey);
      return !row || Number(row.revision) !== revision || Number(row.ordinal) !== entry.position - 1 || row.fingerprint !== entry.fingerprint;
    });
    if (stored.filter((row) => Number(row.revision) === revision).length !== items.length || mismatch) {
      throw new RaiseException("Stored current media does not match the idempotent manifest revision", "23514");
    }
    // Same identity: refresh the (signed) source URLs and payloads only.
    const unchanged = `EXISTS (SELECT 1 FROM ${SUBMISSIONS} WHERE id = ? AND media_processing_revision = ? AND media_manifest_fingerprint = ?)`;
    await db.batch([
      ...items.map((entry) => db.prepare(`UPDATE ${MEDIA} SET source_url = ?, payload = ?, updated_at = ?
          WHERE submission_id = ? AND revision = ? AND is_current AND media_key = ? AND ${unchanged}`)
        .bind(entry.sourceUrl, JSON.stringify(entry.item), now, submissionId, revision, entry.mediaKey, submissionId, revision, fingerprint)),
      db.prepare(`UPDATE ${JOBS} AS job SET source_url = media.source_url, payload = media.payload, updated_at = ?
          FROM ${MEDIA} AS media WHERE job.media_id = media.id AND job.submission_id = ? AND job.revision = ? AND media.is_current AND ${unchanged}`)
        .bind(now, submissionId, revision, submissionId, revision, fingerprint),
      journal(db, MEDIA, "upsert", { submission_id: submissionId }),
      journal(db, JOBS, "upsert", { submission_id: submissionId }),
    ]);
    return [await db.prepare(SUBMISSION_ROW).bind(submissionId).first<Row>()];
  }

  const next = revision + 1;
  const owned = `EXISTS (SELECT 1 FROM ${SUBMISSIONS} WHERE id = ? AND media_processing_revision = ? AND media_processing_updated_at = ?)`;
  const [fence] = await db.batch([
    // Fence on everything read above; media_finalization_* reset = the reset_social_spot_media_finalization_attempts trigger.
    db.prepare(`UPDATE ${SUBMISSIONS} SET media_processing_state = ?, media_processing_revision = ?, media_manifest_fingerprint = ?, media_item_count = ?,
        media_succeeded_count = 0, media_dead_letter_count = 0, media_processing_queued_at = ?, media_processing_started_at = NULL,
        media_processing_completed_at = ?, media_finalization_token = NULL, media_finalization_lease_expires_at = NULL, media_extraction_attempt_count = 0,
        media_extraction_available_at = NULL, media_extraction_token = NULL, media_extraction_lease_expires_at = NULL, media_processing_updated_at = ?,
        media_finalization_attempt_count = 0, media_finalization_available_at = NULL
      WHERE id = ? AND media_processing_revision = ? AND media_manifest_fingerprint IS ? AND media_processing_state IS ? AND media_extraction_token IS ?
      RETURNING id`)
      .bind(items.length === 0 ? "succeeded" : "queued", next, fingerprint, items.length, now, items.length === 0 ? now : null, now,
        submissionId, revision, same(current.media_manifest_fingerprint), same(current.media_processing_state), same(current.media_extraction_token)),
    db.prepare(`UPDATE ${JOBS} SET state = 'cancelled', claim_token = NULL, lease_expires_at = NULL, cancelled_at = ?, updated_at = ?
        WHERE submission_id = ? AND state IN ${ACTIVE_JOB_STATES} AND ${owned}`).bind(now, now, submissionId, submissionId, next, now),
    db.prepare(`UPDATE ${MEDIA} SET is_current = 0, updated_at = ? WHERE submission_id = ? AND is_current AND ${owned}`).bind(now, submissionId, submissionId, next, now),
    ...items.map((entry) => db.prepare(`INSERT INTO ${MEDIA} (id, submission_id, ordinal, media_key, media_type, source_url, fingerprint, revision, is_current, payload, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ? WHERE ${owned}
        ON CONFLICT (submission_id, media_key) DO UPDATE SET ordinal = excluded.ordinal, media_type = excluded.media_type, source_url = excluded.source_url,
          fingerprint = excluded.fingerprint, revision = excluded.revision, is_current = 1, payload = excluded.payload, updated_at = excluded.updated_at`)
      .bind(crypto.randomUUID(), submissionId, entry.position - 1, entry.mediaKey, entry.mediaType, entry.sourceUrl, entry.fingerprint, next,
        JSON.stringify(entry.item), now, submissionId, next, now)),
    db.prepare(`INSERT INTO ${JOBS} (id, submission_id, media_id, ordinal, media_key, media_type, source_url, payload, revision, fingerprint, state,
        attempt_count, max_attempts, available_at, created_at, updated_at)
      SELECT ${UUID_SQL}, submission_id, id, ordinal, media_key, media_type, source_url, payload, revision, fingerprint, 'queued', 0, ?, ?, ?, ?
      FROM ${MEDIA} WHERE submission_id = ? AND revision = ? AND is_current AND ${owned} ORDER BY ordinal`)
      .bind(maxAttempts, now, now, now, submissionId, next, submissionId, next, now),
    journal(db, SUBMISSIONS, "upsert", { id: submissionId }),
    journal(db, MEDIA, "upsert", { submission_id: submissionId }),
    journal(db, JOBS, "upsert", { submission_id: submissionId }),
  ]);
  if (!fence.results?.length) throw new RaiseException("Social submission changed during the media manifest sync; retry", "40001");
  return [await db.prepare(SUBMISSION_ROW).bind(submissionId).first<Row>()];
}

// ---------------------------------------------------------------- coverage

async function deferSocialSpotMediaCoverage(db: PreviewAppDataReader, args: Args) {
  const submissionId = requireUuid(args.p_submission_id, "p_submission_id");
  const extracted = int(args.p_extracted_count, 0, "p_extracted_count"), expected = int(args.p_expected_count, 0, "p_expected_count");
  if (extracted < 0 || expected < extracted) throw new RaiseException("Invalid extracted and expected media counts", "22023");
  const reason = typeof args.p_reason === "string" ? args.p_reason : "";
  if (chars(btrim(reason)) < 1 || chars(btrim(reason)) > 120) throw new RaiseException("Coverage reason must contain between 1 and 120 characters", "22023");
  const token = optionalUuid(args.p_extraction_token, "p_extraction_token");
  const nowMs = Date.now(), now = at(nowMs);

  const current = await db.prepare(`SELECT media_extraction_attempt_count, media_processing_state, media_extraction_token, media_extraction_lease_expires_at,
      media_processing_revision FROM ${SUBMISSIONS} WHERE id = ?`).bind(submissionId).first<Row>();
  if (!current) throw new RaiseException("Social submission does not exist", "P0002");
  checkExtractionClaim(current, token, nowMs);
  if (token === null && ["queued", "processing", "succeeded", "finalizing", "completed"].includes(String(current.media_processing_state))) {
    throw new RaiseException("Active media work cannot be replaced by incomplete coverage", "40001");
  }
  const attempt = Math.min(Number(current.media_extraction_attempt_count) + 1, 5);
  const state = attempt >= 5 ? "review_required" : "coverage_retry";
  const availableAt = state === "review_required" ? null : attempt === 1 ? now : at(nowMs + Math.min(3600, 5 * 2 ** (attempt - 1)) * 1000);

  const [fence] = await db.batch([
    db.prepare(`UPDATE ${SUBMISSIONS} SET media_processing_state = ?, media_manifest_fingerprint = NULL, media_item_count = ?, media_succeeded_count = 0,
        media_dead_letter_count = 0, media_finalization_token = NULL, media_finalization_lease_expires_at = NULL, media_extraction_attempt_count = ?,
        media_extraction_available_at = ?, media_extraction_token = NULL, media_extraction_lease_expires_at = NULL, media_processing_completed_at = ?,
        media_processing_updated_at = ?
      WHERE id = ? AND media_processing_state IS ? AND media_extraction_token IS ? AND media_processing_revision IS ? AND media_extraction_attempt_count IS ?
      RETURNING id`)
      .bind(state, Math.min(35, extracted), attempt, availableAt, state === "review_required" ? now : null, now,
        submissionId, same(current.media_processing_state), same(current.media_extraction_token), same(current.media_processing_revision), same(current.media_extraction_attempt_count)),
    db.prepare(`UPDATE ${JOBS} SET state = 'cancelled', claim_token = NULL, lease_expires_at = NULL, cancelled_at = ?, updated_at = ?
        WHERE submission_id = ? AND state IN ${ACTIVE_JOB_STATES}
          AND EXISTS (SELECT 1 FROM ${SUBMISSIONS} WHERE id = ? AND media_processing_state = ? AND media_processing_updated_at = ?)`)
      .bind(now, now, submissionId, submissionId, state, now),
    journal(db, SUBMISSIONS, "upsert", { id: submissionId }),
    journal(db, JOBS, "upsert", { submission_id: submissionId }),
  ]);
  if (!fence.results?.length) throw new RaiseException("Social submission changed while deferring media coverage; retry", "40001");
  return [{ processing_state: state, attempt_count: attempt, available_at: availableAt }];
}

async function claimSocialSpotMediaCoverage(db: PreviewAppDataReader, args: Args) {
  const submissionId = requireUuid(args.p_submission_id, "p_submission_id");
  const lease = int(args.p_lease_seconds, 60, "p_lease_seconds");
  if (lease < 15 || lease > 300) throw new RaiseException("Coverage lease must be between 15 and 300 seconds", "22023");
  const nowMs = Date.now(), now = at(nowMs), token = crypto.randomUUID();
  const [claimed] = await db.batch([
    db.prepare(`UPDATE ${SUBMISSIONS} SET media_processing_state = 'coverage_processing', media_extraction_token = ?, media_extraction_lease_expires_at = ?,
        media_processing_updated_at = ?
      WHERE id = ? AND media_processing_state = 'coverage_retry' AND julianday(media_extraction_available_at) <= julianday(?) RETURNING id`)
      .bind(token, at(nowMs + lease * 1000), now, submissionId, now),
    journal(db, SUBMISSIONS, "upsert", { id: submissionId }),
  ]);
  return claimed.results?.length ? token : null;
}

async function scheduleLegacySocialSpotMediaBackfill(db: PreviewAppDataReader, args: Args) {
  const limit = int(args.p_limit, 1, "p_limit");
  if (limit < 1 || limit > 5) throw new RaiseException("Legacy backfill limit must be between 1 and 5", "22023");
  const nowMs = Date.now(), now = at(nowMs);
  const cutoff = typeof args.p_cutoff === "string" ? args.p_cutoff : null;
  if (cutoff === null || Number.isNaN(Date.parse(cutoff)) || Date.parse(cutoff) > nowMs) {
    throw new RaiseException("Legacy cutoff must be present and cannot be in the future", "22023");
  }
  const ids = Array.isArray(args.p_submission_ids) ? args.p_submission_ids : [];
  if (ids.length < 1 || ids.length > 5) throw new RaiseException("Select between 1 and 5 explicit legacy submission IDs", "22023");
  ids.forEach((id) => requireUuid(id, "p_submission_ids"));
  const [scheduled] = await db.batch([
    db.prepare(`UPDATE ${SUBMISSIONS} SET media_processing_state = 'coverage_retry', media_item_count = 0, media_succeeded_count = 0, media_dead_letter_count = 0,
        media_extraction_attempt_count = 0, media_extraction_available_at = ?, media_extraction_token = NULL, media_extraction_lease_expires_at = NULL,
        media_finalization_token = NULL, media_finalization_lease_expires_at = NULL, media_finalization_attempt_count = 0,
        media_finalization_available_at = NULL, media_processing_completed_at = NULL, media_processing_updated_at = ?
      WHERE media_processing_state = 'not_started' AND id IN (
        SELECT submission.id FROM ${SUBMISSIONS} AS submission
        WHERE submission.id IN (SELECT value FROM json_each(?)) AND julianday(submission.created_at) < julianday(?)
          AND submission.media_processing_state = 'not_started' AND submission.media_processing_revision = 0
          AND submission.platform IN ('tiktok', 'instagram') AND (submission.platform = 'tiktok' OR ?) AND (submission.spot_id IS NULL OR ?)
          AND submission.status IN ('spot_created', 'spot_reused', 'needs_review', 'research_pending') AND length(trim(submission.canonical_url)) > 0
          AND NOT EXISTS (SELECT 1 FROM ${JOBS} AS job WHERE job.submission_id = submission.id AND job.state <> 'cancelled')
        ORDER BY julianday(submission.created_at), submission.id LIMIT ?)
      RETURNING id AS submission_id`)
      .bind(now, now, JSON.stringify(ids), cutoff, args.p_include_instagram === true ? 1 : 0, args.p_include_resolved === true ? 1 : 0, limit),
    ...ids.map((id) => journal(db, SUBMISSIONS, "upsert", { id: id as string })),
  ]);
  return scheduled.results ?? [];
}

// ---------------------------------------------------------------- work list and job leases

async function listReadySocialSpotMediaWork(db: PreviewAppDataReader, args: Args) {
  const limit = Math.min(10, Math.max(1, typeof args.p_limit === "number" ? args.p_limit : 3));
  const now = nowTimestamptz();
  return (await db.prepare(`SELECT submission.id AS submission_id FROM ${SUBMISSIONS} AS submission
    WHERE (submission.media_processing_state = 'succeeded'
        AND (submission.media_finalization_available_at IS NULL OR julianday(submission.media_finalization_available_at) <= julianday(?1)))
      OR (submission.media_processing_state = 'coverage_retry' AND julianday(submission.media_extraction_available_at) <= julianday(?1))
      OR (submission.media_processing_state IN ('queued', 'processing') AND EXISTS (
        SELECT 1 FROM ${JOBS} AS job WHERE job.submission_id = submission.id AND job.revision = submission.media_processing_revision
          AND ((job.state IN ('queued', 'retry_wait') AND julianday(job.available_at) <= julianday(?1))
            OR (job.state = 'leased' AND julianday(job.lease_expires_at) <= julianday(?1)))))
    ORDER BY julianday(submission.media_processing_updated_at), submission.id LIMIT ?2`).bind(now, limit).all<Row>()).results;
}

/**
 * claim_social_spot_media_finalization_v1 (the aggregate step every job transition ends with) as one UPDATE. Its count
 * invariant is checked before the batch by assertFinalizable, because a failed RAISE must leave the whole batch unwritten.
 */
function aggregateStatement(db: PreviewAppDataReader, submissionId: string, revision: number, now: string, guard = "1", guardParams: Bound[] = []) {
  const finalized = "jobs.succeeded = submission.media_item_count AND media.matched = submission.media_item_count AND jobs.dead = 0";
  const started = "jobs.leased > 0 OR jobs.succeeded > 0";
  return db.prepare(`UPDATE ${SUBMISSIONS} AS submission SET
      media_processing_state = CASE WHEN ${finalized} THEN 'succeeded' WHEN jobs.dead > 0 THEN 'dead_letter'
        WHEN ${started} OR submission.media_processing_started_at IS NOT NULL THEN 'processing' ELSE 'queued' END,
      media_succeeded_count = jobs.succeeded,
      media_dead_letter_count = jobs.dead,
      media_processing_started_at = CASE WHEN ${started} OR jobs.dead > 0 THEN COALESCE(submission.media_processing_started_at, ?)
        ELSE submission.media_processing_started_at END,
      media_processing_completed_at = CASE WHEN ${finalized} THEN COALESCE(submission.media_processing_completed_at, ?) ELSE NULL END,
      media_finalization_token = NULL, media_finalization_lease_expires_at = NULL, media_processing_updated_at = ?
    FROM (SELECT count(*) AS total, coalesce(sum(state = 'succeeded'), 0) AS succeeded, coalesce(sum(state = 'dead_letter'), 0) AS dead, coalesce(sum(state = 'leased'), 0) AS leased
        FROM ${JOBS} WHERE submission_id = ? AND revision = ?) AS jobs,
      (SELECT count(*) AS current, coalesce(sum(EXISTS (SELECT 1 FROM ${JOBS} AS job WHERE job.media_id = m.id AND job.submission_id = m.submission_id
          AND job.revision = m.revision AND job.fingerprint = m.fingerprint AND job.state = 'succeeded')), 0) AS matched
        FROM ${MEDIA} AS m WHERE m.submission_id = ? AND m.revision = ? AND m.is_current) AS media
    WHERE submission.id = ? AND submission.media_processing_revision = ? AND submission.media_processing_state NOT IN ('finalizing', 'completed')
      AND media.current = submission.media_item_count AND jobs.total = submission.media_item_count AND ${guard}`)
    .bind(now, now, now, submissionId, revision, submissionId, revision, submissionId, revision, ...guardParams);
}

async function assertFinalizable(db: PreviewAppDataReader, submissionId: string, revision: number) {
  const row = await db.prepare(`SELECT submission.media_item_count AS expected, submission.media_processing_state AS state,
      (SELECT count(*) FROM ${MEDIA} WHERE submission_id = submission.id AND revision = ? AND is_current) AS media,
      (SELECT count(*) FROM ${JOBS} WHERE submission_id = submission.id AND revision = ?) AS jobs
    FROM ${SUBMISSIONS} AS submission WHERE submission.id = ? AND submission.media_processing_revision = ?`)
    .bind(revision, revision, submissionId, revision).first<Row>();
  if (!row) throw new RaiseException("Submission media revision is stale or does not exist", "40001");
  if (row.state === "finalizing" || row.state === "completed") return;
  if (Number(row.media) !== Number(row.expected) || Number(row.jobs) !== Number(row.expected)) {
    throw new RaiseException(`Current media/job count does not match manifest count for revision ${revision}`, "23514");
  }
}

/** The v1 return value after the aggregate ran: completed -> true, finalizing -> false, otherwise "all succeeded". */
async function finalizedAfter(db: PreviewAppDataReader, submissionId: string) {
  const row = await db.prepare(`SELECT media_processing_state AS state, media_succeeded_count AS succeeded, media_item_count AS items
    FROM ${SUBMISSIONS} WHERE id = ?`).bind(submissionId).first<Row>();
  return { row, finalized: row?.state === "completed" || row?.state === "succeeded" };
}

async function claimSocialSpotMediaJobs(db: PreviewAppDataReader, args: Args) {
  const submissionId = requireUuid(args.p_submission_id, "p_submission_id");
  const revision = int(args.p_revision, 0, "p_revision");
  if (revision <= 0) throw new RaiseException("Revision must be positive", "22023");
  const worker = typeof args.p_worker_id === "string" ? btrim(args.p_worker_id) : "";
  if (chars(worker) < 1 || chars(worker) > 200) throw new RaiseException("worker_id must contain between 1 and 200 characters", "22023");
  const limit = int(args.p_limit, 1, "p_limit");
  if (limit < 1 || limit > 20) throw new RaiseException("Claim limit must be between 1 and 20", "22023");
  const lease = int(args.p_lease_seconds, 300, "p_lease_seconds");
  if (lease < 15 || lease > 3600) throw new RaiseException("Lease duration must be between 15 and 3600 seconds", "22023");
  const kind = args.p_media_kind ?? null;
  if (kind !== null && kind !== "image" && kind !== "video") throw new RaiseException("media_kind must be image, video, or null", "22023");
  await assertFinalizable(db, submissionId, revision);
  const nowMs = Date.now(), now = at(nowMs);
  const sameRevision = `EXISTS (SELECT 1 FROM ${SUBMISSIONS} WHERE id = ? AND media_processing_revision = ?)`;

  const [, , claimed] = await db.batch([
    // Defensive cleanup: stale revisions and replaced media can never be claimed.
    db.prepare(`UPDATE ${JOBS} AS job SET state = 'cancelled', claim_token = NULL, lease_expires_at = NULL, cancelled_at = ?, updated_at = ?
        WHERE job.submission_id = ? AND job.state IN ${ACTIVE_JOB_STATES} AND (job.revision <> ? OR NOT ${CURRENT_MEDIA_MATCHES}) AND ${sameRevision}`)
      .bind(now, now, submissionId, revision, submissionId, revision),
    // A worker that used its final attempt and vanished must not strand an expired lease.
    db.prepare(`UPDATE ${JOBS} SET state = 'dead_letter', claim_token = NULL, lease_expires_at = NULL, dead_lettered_at = ?,
        last_error = COALESCE(last_error, 'Lease expired after final attempt'), updated_at = ?
      WHERE submission_id = ? AND revision = ? AND attempt_count >= max_attempts
        AND (state IN ('queued', 'retry_wait') OR (state = 'leased' AND julianday(lease_expires_at) <= julianday(?))) AND ${sameRevision}`)
      .bind(now, now, submissionId, revision, now, submissionId, revision),
    db.prepare(`UPDATE ${JOBS} SET state = 'leased', attempt_count = attempt_count + 1, claim_token = ${UUID_SQL}, claimed_by = ?, claimed_at = ?,
        lease_expires_at = ?, updated_at = ?
      WHERE id IN (SELECT job.id FROM ${JOBS} AS job
        WHERE job.submission_id = ? AND job.revision = ? AND (? IS NULL OR job.media_type = ?) AND job.attempt_count < job.max_attempts
          AND ((job.state IN ('queued', 'retry_wait') AND julianday(job.available_at) <= julianday(?))
            OR (job.state = 'leased' AND julianday(job.lease_expires_at) <= julianday(?)))
          AND ${CURRENT_MEDIA_MATCHES}
        ORDER BY CASE WHEN job.state = 'leased' THEN julianday(job.lease_expires_at) ELSE julianday(job.available_at) END, julianday(job.created_at), job.ordinal
        LIMIT ?) AND ${sameRevision}
      RETURNING id AS job_id, claim_token, submission_id, revision, media_id, media_key, fingerprint, ordinal, media_type AS media_kind, source_url,
        attempt_count, max_attempts`)
      .bind(worker, now, at(nowMs + lease * 1000), now, submissionId, revision, kind, kind, now, now, limit, submissionId, revision),
    aggregateStatement(db, submissionId, revision, now),
    journal(db, JOBS, "upsert", { submission_id: submissionId }),
    journal(db, SUBMISSIONS, "upsert", { id: submissionId }),
  ]);
  return [...(claimed.results ?? [])].sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
}

async function readJobSubmission(db: PreviewAppDataReader, jobId: string) {
  const job = await db.prepare(`SELECT job.submission_id, job.revision, job.attempt_count, job.max_attempts, job.state, job.claim_token, job.lease_expires_at,
      submission.media_processing_revision AS current_revision
    FROM ${JOBS} AS job LEFT JOIN ${SUBMISSIONS} AS submission ON submission.id = job.submission_id WHERE job.id = ?`).bind(jobId).first<Row>();
  if (!job) throw new RaiseException("Media job does not exist", "P0002");
  return job;
}

async function completeSocialSpotMediaJob(db: PreviewAppDataReader, args: Args) {
  const jobId = requireUuid(args.p_job_id, "p_job_id");
  if (args.p_claim_token === null || args.p_claim_token === undefined) throw new RaiseException("claim_token is required", "22023");
  const token = requireUuid(args.p_claim_token, "p_claim_token");
  const job = await readJobSubmission(db, jobId);
  const submissionId = String(job.submission_id), revision = Number(job.revision);
  if (revision === Number(job.current_revision)) await assertFinalizable(db, submissionId, revision);
  const now = nowTimestamptz();
  const [settled] = await db.batch([
    db.prepare(`UPDATE ${JOBS} AS job SET state = 'succeeded', claim_token = NULL, lease_expires_at = NULL, succeeded_at = ?, last_error = NULL, result = ?,
        updated_at = ?
      WHERE job.id = ? AND job.submission_id = ? AND job.revision = ? AND job.state = 'leased' AND job.claim_token = ?
        AND julianday(job.lease_expires_at) > julianday(?) AND ${CURRENT_MEDIA_MATCHES}
        AND EXISTS (SELECT 1 FROM ${SUBMISSIONS} WHERE id = ? AND media_processing_revision = ?)
      RETURNING id`)
      .bind(now, JSON.stringify(args.p_result ?? {}), now, jobId, submissionId, revision, token, now, submissionId, revision),
    aggregateStatement(db, submissionId, revision, now, `EXISTS (SELECT 1 FROM ${JOBS} WHERE id = ? AND state = 'succeeded' AND succeeded_at = ?)`, [jobId, now]),
    journal(db, JOBS, "upsert", { submission_id: submissionId }),
    journal(db, SUBMISSIONS, "upsert", { id: submissionId }),
  ]);
  if (!settled.results?.length) throw new RaiseException("Media job claim is stale, expired, or already settled", "40001");
  const { row, finalized } = await finalizedAfter(db, submissionId);
  return [{ job_id: jobId, submission_id: submissionId, revision, job_state: "succeeded", processing_state: row?.state ?? null, finalized,
    succeeded_count: row?.succeeded ?? null, item_count: row?.items ?? null }];
}

async function failSocialSpotMediaJob(db: PreviewAppDataReader, args: Args) {
  const jobId = requireUuid(args.p_job_id, "p_job_id");
  if (args.p_claim_token === null || args.p_claim_token === undefined) throw new RaiseException("claim_token is required", "22023");
  const token = requireUuid(args.p_claim_token, "p_claim_token");
  const error = typeof args.p_error === "string" ? btrim(args.p_error) : "";
  if (chars(error) < 1 || chars(error) > 8000) throw new RaiseException("error must contain between 1 and 8000 characters", "22023");
  const retryAfter = args.p_retry_after_seconds ?? null;
  if (retryAfter !== null && (typeof retryAfter !== "number" || retryAfter < 1 || retryAfter > 3600)) {
    throw new RaiseException("retry_after_seconds must be between 1 and 3600", "22023");
  }
  const job = await readJobSubmission(db, jobId);
  const nowMs = Date.now(), now = at(nowMs);
  if (job.state !== "leased" || job.claim_token !== token || expired(job.lease_expires_at, nowMs) || Number(job.revision) !== Number(job.current_revision)) {
    throw new RaiseException("Media job claim is stale, expired, or already settled", "40001");
  }
  const submissionId = String(job.submission_id), revision = Number(job.revision);
  const attempts = Number(job.attempt_count), maxAttempts = Number(job.max_attempts);
  await assertFinalizable(db, submissionId, revision);
  const dead = args.p_retryable === false || attempts >= maxAttempts;
  const state = dead ? "dead_letter" : "retry_wait";
  const backoff = (retryAfter as number | null) ?? Math.min(3600, 5 * 2 ** Math.max(attempts - 1, 0));
  const [settled] = await db.batch([
    db.prepare(`UPDATE ${JOBS} AS job SET state = ?, claim_token = NULL, lease_expires_at = NULL, available_at = COALESCE(?, job.available_at),
        dead_lettered_at = ?, last_error = ?, updated_at = ?
      WHERE job.id = ? AND job.submission_id = ? AND job.revision = ? AND job.state = 'leased' AND job.claim_token = ? AND job.attempt_count = ?
        AND ${CURRENT_MEDIA_MATCHES} AND EXISTS (SELECT 1 FROM ${SUBMISSIONS} WHERE id = ? AND media_processing_revision = ?)
      RETURNING state, available_at`)
      .bind(state, dead ? null : at(nowMs + backoff * 1000), dead ? now : null, error, now, jobId, submissionId, revision, token, attempts, submissionId, revision),
    aggregateStatement(db, submissionId, revision, now, `EXISTS (SELECT 1 FROM ${JOBS} WHERE id = ? AND state = ? AND updated_at = ?)`, [jobId, state, now]),
    journal(db, JOBS, "upsert", { submission_id: submissionId }),
    journal(db, SUBMISSIONS, "upsert", { id: submissionId }),
  ]);
  const updated = settled.results?.[0];
  if (!updated) throw new RaiseException("Media job fingerprint no longer matches the current manifest", "40001");
  const after = await db.prepare(`SELECT media_processing_state FROM ${SUBMISSIONS} WHERE id = ?`).bind(submissionId).first<Row>();
  return [{ job_id: jobId, submission_id: submissionId, revision, job_state: state, processing_state: after?.media_processing_state ?? null,
    next_available_at: state === "retry_wait" ? updated.available_at : null, attempt_count: attempts, max_attempts: maxAttempts }];
}

// ---------------------------------------------------------------- finalization (v2 lease)

async function claimSocialSpotMediaFinalization(db: PreviewAppDataReader, args: Args) {
  const submissionId = requireUuid(args.p_submission_id, "p_submission_id");
  const revision = int(args.p_revision, 0, "p_revision");
  if (revision <= 0) throw new RaiseException("Revision must be positive", "22023");
  const lease = int(args.p_lease_seconds, 180, "p_lease_seconds");
  if (lease < 30 || lease > 600) throw new RaiseException("Finalization lease must be between 30 and 600 seconds", "22023");
  const nowMs = Date.now(), now = at(nowMs), token = crypto.randomUUID();
  const ready = `id = ? AND media_processing_revision = ? AND media_processing_state = 'succeeded'
    AND (media_finalization_available_at IS NULL OR julianday(media_finalization_available_at) <= julianday(?))`;
  const [, claimed] = await db.batch([
    db.prepare(`UPDATE ${SUBMISSIONS} SET status = 'needs_review', media_processing_state = 'review_required', media_processing_completed_at = ?,
        media_processing_updated_at = ?, research_summary = ? WHERE ${ready} AND media_finalization_attempt_count >= 5`)
      .bind(now, now, REVIEW_SUMMARY, submissionId, revision, now),
    db.prepare(`UPDATE ${SUBMISSIONS} SET media_processing_state = 'finalizing', media_processing_started_at = COALESCE(media_processing_started_at, ?),
        media_finalization_token = ?, media_finalization_lease_expires_at = ?, media_finalization_attempt_count = media_finalization_attempt_count + 1,
        media_finalization_available_at = NULL, media_processing_updated_at = ?
      WHERE ${ready} AND media_finalization_attempt_count < 5 RETURNING id`)
      .bind(now, token, at(nowMs + lease * 1000), now, submissionId, revision, now),
    journal(db, SUBMISSIONS, "upsert", { id: submissionId }),
  ]);
  return claimed.results?.length ? token : null;
}

async function settleSocialSpotMediaFinalization(db: PreviewAppDataReader, args: Args) {
  const submissionId = requireUuid(args.p_submission_id, "p_submission_id");
  const revision = int(args.p_revision, 0, "p_revision");
  const token = optionalUuid(args.p_finalization_token, "p_finalization_token");
  const nowMs = Date.now(), now = at(nowMs);
  const owned = `id = ? AND media_processing_revision = ? AND media_processing_state = 'finalizing' AND media_finalization_token = ?
    AND julianday(media_finalization_lease_expires_at) > julianday(?)`;
  const current = await db.prepare(`SELECT media_finalization_attempt_count AS attempts FROM ${SUBMISSIONS} WHERE ${owned}`)
    .bind(submissionId, revision, token, now).first<Row>();
  if (!current) throw new RaiseException("Social media finalization token is stale or expired", "40001");
  const attempts = Number(current.attempts);
  const state = args.p_succeeded === true ? "completed" : attempts >= 5 ? "review_required" : "succeeded";
  const [settled] = await db.batch([
    db.prepare(`UPDATE ${SUBMISSIONS} SET status = CASE WHEN ? = 'review_required' THEN 'needs_review' ELSE status END, media_processing_state = ?,
        media_finalization_token = NULL, media_finalization_lease_expires_at = NULL, media_finalization_available_at = ?, media_processing_completed_at = ?,
        media_processing_updated_at = ?, research_summary = CASE WHEN ? = 'review_required' THEN ? ELSE research_summary END
      WHERE ${owned} AND media_finalization_attempt_count = ? RETURNING id`)
      .bind(state, state, state === "succeeded" ? at(nowMs + Math.min(900, 30 * 2 ** Math.max(0, attempts - 1)) * 1000) : null,
        state === "succeeded" ? null : now, now, state, REVIEW_SUMMARY, submissionId, revision, token, now, attempts),
    journal(db, SUBMISSIONS, "upsert", { id: submissionId }),
  ]);
  if (!settled.results?.length) throw new RaiseException("Social media finalization token is stale or expired", "40001");
  return state;
}

// ---------------------------------------------------------------- candidates

export function candidateKey(candidate: Row, ordinality: number): string {
  const name = field(candidate, "spotName") ?? "", address = field(candidate, "address") ?? "", city = field(candidate, "city") ?? "";
  const norm = (value: string) => btrim(value).toLowerCase();
  return md5(`${norm(name)}|${norm(address)}|${norm(city)}${name === "" && address === "" && city === "" ? `|ordinal:${ordinality}` : ""}`);
}

async function syncSocialSubmissionCandidates(db: PreviewAppDataReader, args: Args) {
  const submissionId = requireUuid(args.p_submission_id, "p_submission_id");
  const candidates = args.p_candidates ?? [];
  if (!Array.isArray(candidates)) throw new RaiseException("Candidates must be a JSON array", "22023");
  const incoming = candidates.map((value, index) => {
    const row = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Row;
    const spotId = nullif(field(row, "spotId"));
    return { value, ordinal: index, key: candidateKey(row, index + 1), spotId: spotId === null ? null : requireUuid(spotId, "spotId"),
      status: nullif(field(row, "status")) ?? "research_pending" };
  });
  if (new Set(incoming.map((entry) => entry.key)).size !== incoming.length) {
    throw new RaiseException("ON CONFLICT DO UPDATE command cannot affect row a second time", "21000");
  }
  const now = nowTimestamptz();
  const results = await db.batch([
    ...incoming.map((entry) => db.prepare(`INSERT INTO ${CANDIDATES} (id, submission_id, candidate_key, ordinal, spot_id, status, research, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (submission_id, candidate_key) DO UPDATE SET ordinal = excluded.ordinal, spot_id = excluded.spot_id, status = excluded.status,
          research = excluded.research, updated_at = excluded.updated_at`)
      .bind(crypto.randomUUID(), submissionId, entry.key, entry.ordinal, entry.spotId, entry.status, JSON.stringify(entry.value), now)),
    db.prepare(`DELETE FROM ${CANDIDATES} WHERE submission_id = ? AND spot_id IS NULL AND status IN ('needs_review', 'research_pending')
        AND candidate_key NOT IN (SELECT value FROM json_each(?)) RETURNING id`).bind(submissionId, JSON.stringify(incoming.map((entry) => entry.key))),
    journal(db, CANDIDATES, "upsert", { submission_id: submissionId }),
  ]);
  return incoming.length + (results[incoming.length].results?.length ?? 0);
}

export const SOCIAL_MEDIA_RPCS: Record<string, (db: PreviewAppDataReader, args: Args) => Promise<unknown>> = {
  sync_social_spot_media_v1: syncSocialSpotMedia,
  defer_social_spot_media_coverage_v1: deferSocialSpotMediaCoverage,
  claim_social_spot_media_coverage_v1: claimSocialSpotMediaCoverage,
  schedule_legacy_social_spot_media_backfill_v1: scheduleLegacySocialSpotMediaBackfill,
  list_ready_social_spot_media_work_v1: listReadySocialSpotMediaWork,
  claim_social_spot_media_jobs_v1: claimSocialSpotMediaJobs,
  complete_social_spot_media_job_v1: completeSocialSpotMediaJob,
  fail_social_spot_media_job_v1: failSocialSpotMediaJob,
  claim_social_spot_media_finalization_v2: claimSocialSpotMediaFinalization,
  settle_social_spot_media_finalization_v2: settleSocialSpotMediaFinalization,
  sync_social_submission_candidates_v1: syncSocialSubmissionCandidates,
};
