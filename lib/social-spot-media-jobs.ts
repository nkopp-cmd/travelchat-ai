import { createHash, randomUUID } from "node:crypto";
import type { createSupabaseAdmin } from "@/lib/supabase";
import {
  getTrustedSocialVideoUrls,
  isTrustedSocialImageUrl,
  type SocialLinkMetadata,
} from "@/lib/social-spot-submissions";

export const SOCIAL_MEDIA_PIPELINE_VERSION = "social-media-v1";
export const SOCIAL_MEDIA_MANIFEST_LIMIT = 35;

export type SocialMediaKind = "image" | "video";
export type SocialMediaJobState =
  | "queued"
  | "leased"
  | "retry_wait"
  | "succeeded"
  | "dead_letter"
  | "cancelled";

export interface SocialMediaManifestItem {
  ordinal: number;
  mediaKey: string;
  mediaKind: SocialMediaKind;
  sourceUrl: string;
  previewUrl: string | null;
  inputFingerprint: string;
}

export interface SocialMediaCoverage {
  complete: boolean;
  expectedCount: number;
  extractedCount: number;
  reason: "complete" | "no_media" | "cover_only" | "provider_partial" | "count_mismatch";
}

export interface ClaimedSocialMediaJob {
  jobId: string;
  claimToken: string;
  submissionId: string;
  revision: number;
  mediaId: string;
  mediaKey: string;
  inputFingerprint: string;
  ordinal: number;
  mediaKind: SocialMediaKind;
  sourceUrl: string;
  attemptCount: number;
  maxAttempts: number;
}

export interface SocialMediaProgressItem {
  id: string;
  submissionId: string;
  revision: number;
  ordinal: number;
  mediaKind: SocialMediaKind;
  previewUrl: string | null;
  state: SocialMediaJobState;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string | null;
  publicErrorCode: string | null;
  result: { output?: string | null } | null;
}

export interface SocialMediaWorkSubmission {
  id: string;
  canonicalUrl: string;
  platform: "instagram" | "tiktok";
  revision: number;
  state: string;
  metadata: SocialLinkMetadata;
  research: Record<string, unknown>;
  notes: string | null;
  cityHint: string | null;
}

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

function mediaIdentity(value: string): string {
  const parsed = new URL(value);
  return `${parsed.hostname.toLowerCase()}${parsed.pathname}`;
}

function uniqueTrustedImages(metadata: SocialLinkMetadata): string[] {
  const seen = new Set<string>();
  const images: string[] = [];
  for (const value of [
    ...(metadata.mediaUrls || []),
    metadata.imageUrl,
    metadata.thumbnailUrl,
  ]) {
    if (!isTrustedSocialImageUrl(value)) continue;
    const identity = mediaIdentity(value);
    if (seen.has(identity)) continue;
    seen.add(identity);
    images.push(value);
  }
  return images;
}

function fingerprintMedia(input: {
  mediaKey: string;
  mediaKind: SocialMediaKind;
  sourceUrl: string;
}): string {
  return createHash("sha256")
    .update([
      SOCIAL_MEDIA_PIPELINE_VERSION,
      input.mediaKey,
      input.mediaKind,
      mediaIdentity(input.sourceUrl),
    ].join("|"))
    .digest("hex");
}

export function buildSocialMediaManifest(
  metadata: SocialLinkMetadata,
): SocialMediaManifestItem[] {
  const videos = getTrustedSocialVideoUrls(metadata);
  const videoIdentities = new Set(videos.map(mediaIdentity));
  const images = uniqueTrustedImages(metadata).filter(
    (imageUrl) => !videoIdentities.has(mediaIdentity(imageUrl)),
  );
  const manifest: SocialMediaManifestItem[] = [];

  for (let index = 0; index < images.length; index += 1) {
    const mediaKey = `image:${index}`;
    const item = {
      ordinal: manifest.length,
      mediaKey,
      mediaKind: "image" as const,
      sourceUrl: images[index],
      previewUrl: images[index],
    };
    manifest.push({
      ...item,
      inputFingerprint: fingerprintMedia(item),
    });
    if (manifest.length >= SOCIAL_MEDIA_MANIFEST_LIMIT) return manifest;
  }

  for (let index = 0; index < videos.length; index += 1) {
    const mediaKey = `video:${index}`;
    const item = {
      ordinal: manifest.length,
      mediaKey,
      mediaKind: "video" as const,
      sourceUrl: videos[index],
      previewUrl: metadata.imageUrl || metadata.thumbnailUrl || null,
    };
    manifest.push({
      ...item,
      inputFingerprint: fingerprintMedia(item),
    });
    if (manifest.length >= SOCIAL_MEDIA_MANIFEST_LIMIT) return manifest;
  }

  return manifest;
}

export function assessSocialMediaCoverage(
  metadata: SocialLinkMetadata,
  manifest = buildSocialMediaManifest(metadata),
): SocialMediaCoverage {
  const extractedCount = manifest.length;
  const trustedVideos = getTrustedSocialVideoUrls(metadata);
  const videoIdentities = new Set(trustedVideos.map(mediaIdentity));
  const discoveredCount = trustedVideos.length + uniqueTrustedImages(metadata).filter(
    (imageUrl) => !videoIdentities.has(mediaIdentity(imageUrl)),
  ).length;
  const expectedCount = Math.max(
    extractedCount,
    discoveredCount,
    Number(metadata.mediaItemCount || 0),
    Number(metadata.mediaExtractedCount || 0),
  );
  if (extractedCount === 0) {
    return { complete: false, expectedCount, extractedCount, reason: "no_media" };
  }
  if (["cover_only", "media_unavailable"].includes(metadata.mediaAccessStatus || "")) {
    return { complete: false, expectedCount, extractedCount, reason: "cover_only" };
  }
  if (metadata.mediaCompleteness === "partial") {
    return { complete: false, expectedCount, extractedCount, reason: "provider_partial" };
  }
  if (
    discoveredCount > extractedCount ||
    (metadata.mediaItemCount || 0) > extractedCount ||
    (
      metadata.mediaItemCount !== undefined &&
      metadata.mediaExtractedCount !== undefined &&
      metadata.mediaExtractedCount < metadata.mediaItemCount
    )
  ) {
    return { complete: false, expectedCount, extractedCount, reason: "count_mismatch" };
  }
  return { complete: true, expectedCount, extractedCount, reason: "complete" };
}

function isOptionalMediaSchemaError(error: {
  code?: string | null;
  message?: string | null;
} | null | undefined): boolean {
  return Boolean(
    error &&
      (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(
        error.code || "",
      ) || /does not exist|schema cache|could not find the function|could not find the table/i.test(
        error.message || "",
      )),
  );
}

export async function syncSocialMediaManifest(input: {
  supabase: SupabaseAdmin;
  submissionId: string;
  metadata: SocialLinkMetadata;
  extractionToken?: string;
}): Promise<{
  available: boolean;
  queued: boolean;
  workerRequired: boolean;
  coverage: SocialMediaCoverage;
  total: number;
  revision: number;
  state: string;
}> {
  const manifest = buildSocialMediaManifest(input.metadata);
  const coverage = assessSocialMediaCoverage(input.metadata, manifest);
  if (!coverage.complete) {
    const { data, error } = await input.supabase.rpc(
      "defer_social_spot_media_coverage_v1",
      {
        p_submission_id: input.submissionId,
        p_extracted_count: coverage.extractedCount,
        p_expected_count: coverage.expectedCount,
        p_reason: coverage.reason,
        p_extraction_token: input.extractionToken || null,
      },
    );
    if (error) {
      if (isOptionalMediaSchemaError(error)) {
        return {
          available: false,
          queued: false,
          workerRequired: false,
          coverage,
          total: manifest.length,
          revision: 0,
          state: "schema_unavailable",
        };
      }
      throw new Error(`Could not defer incomplete social media coverage: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    const state = String(row?.processing_state || "coverage_retry");
    return {
      available: true,
      queued: false,
      workerRequired: state === "coverage_retry",
      coverage,
      total: manifest.length,
      revision: 0,
      state,
    };
  }

  const { data, error } = await input.supabase.rpc("sync_social_spot_media_v1", {
    p_submission_id: input.submissionId,
    p_manifest: manifest.map((item) => ({
      ordinal: item.ordinal,
      mediaKey: item.mediaKey,
      mediaKind: item.mediaKind,
      sourceUrl: item.sourceUrl,
      previewUrl: item.previewUrl,
      inputFingerprint: item.inputFingerprint,
      fingerprint: item.inputFingerprint,
      mediaType: item.mediaKind,
    })),
    p_max_attempts: 5,
    p_extraction_token: input.extractionToken || null,
  });
  if (error) {
    if (isOptionalMediaSchemaError(error)) {
      return {
        available: false,
        queued: false,
        workerRequired: false,
        coverage,
        total: manifest.length,
        revision: 0,
        state: "schema_unavailable",
      };
    }
    throw new Error(`Could not queue social media: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    available: true,
    queued: true,
    workerRequired: true,
    coverage,
    total: Number(row?.item_count ?? manifest.length),
    revision: Number(row?.revision || 1),
    state: String(row?.processing_state || "queued"),
  };
}

function normalizeClaimedJob(value: unknown): ClaimedSocialMediaJob | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.job_id !== "string" ||
    typeof row.claim_token !== "string" ||
    typeof row.submission_id !== "string" ||
    typeof row.media_id !== "string" ||
    typeof row.media_key !== "string" ||
    typeof row.fingerprint !== "string" ||
    !["image", "video"].includes(String(row.media_kind)) ||
    typeof row.source_url !== "string"
  ) {
    return null;
  }
  return {
    jobId: row.job_id,
    claimToken: row.claim_token,
    submissionId: row.submission_id,
    revision: Number(row.revision || 1),
    mediaId: row.media_id,
    mediaKey: row.media_key,
    inputFingerprint: row.fingerprint,
    ordinal: Number(row.ordinal || 0),
    mediaKind: row.media_kind as SocialMediaKind,
    sourceUrl: row.source_url,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 3),
  };
}

export async function claimSocialMediaJobs(input: {
  supabase: SupabaseAdmin;
  submissionId: string;
  revision: number;
  mediaKind?: SocialMediaKind;
  limit?: number;
  leaseSeconds?: number;
}): Promise<ClaimedSocialMediaJob[]> {
  const workerId = `vercel:${randomUUID()}`;
  const { data, error } = await input.supabase.rpc("claim_social_spot_media_jobs_v1", {
    p_submission_id: input.submissionId,
    p_revision: input.revision,
    p_worker_id: workerId,
    p_limit: Math.min(20, Math.max(1, input.limit || 1)),
    p_lease_seconds: Math.min(300, Math.max(60, input.leaseSeconds || 180)),
    p_media_kind: input.mediaKind || null,
  });
  if (error) {
    if (isOptionalMediaSchemaError(error)) return [];
    throw new Error(`Could not claim social media jobs: ${error.message}`);
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const jobs = rows.map(normalizeClaimedJob);
  if (jobs.some((job) => !job)) {
    throw new Error("Social media claim RPC returned an invalid row contract.");
  }
  return jobs as ClaimedSocialMediaJob[];
}

export async function completeSocialMediaJob(input: {
  supabase: SupabaseAdmin;
  job: ClaimedSocialMediaJob;
  output: string;
}): Promise<boolean> {
  const { data, error } = await input.supabase.rpc("complete_social_spot_media_job_v1", {
    p_job_id: input.job.jobId,
    p_claim_token: input.job.claimToken,
    p_result: { output: input.output },
  });
  if (error) throw new Error(`Could not complete social media job: ${error.message}`);
  return Boolean(data);
}

export function classifySocialMediaJobError(error: unknown): {
  code: string;
  retryable: boolean;
  message: string;
} {
  const message = error instanceof Error ? error.message : "Media analysis failed";
  const lower = message.toLowerCase();
  if (/untrusted|unsupported|too large|did not return a video|invalid/.test(lower)) {
    return { code: "MEDIA_UNSUPPORTED", retryable: false, message };
  }
  if (/429|rate limit/.test(lower)) {
    return { code: "MEDIA_RATE_LIMITED", retryable: true, message };
  }
  if (/timeout|timed out|abort|5\d\d|unavailable|download failed/.test(lower)) {
    return { code: "MEDIA_TEMPORARILY_UNAVAILABLE", retryable: true, message };
  }
  return { code: "MEDIA_ANALYSIS_FAILED", retryable: true, message };
}

export async function failSocialMediaJob(input: {
  supabase: SupabaseAdmin;
  job: ClaimedSocialMediaJob;
  error: unknown;
}): Promise<void> {
  const failure = classifySocialMediaJobError(input.error);
  const { error } = await input.supabase.rpc("fail_social_spot_media_job_v1", {
    p_job_id: input.job.jobId,
    p_claim_token: input.job.claimToken,
    p_error: `${failure.code}: ${failure.message}`.slice(0, 500),
    p_retryable: failure.retryable,
    p_retry_after_seconds: null,
  });
  if (error) throw new Error(`Could not fail social media job: ${error.message}`);
}

export async function claimSocialMediaCoverageRetry(input: {
  supabase: SupabaseAdmin;
  submissionId: string;
}): Promise<string | null> {
  const token = randomUUID();
  const now = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
  const { data, error } = await input.supabase
    .from("social_spot_submissions")
    .update({
      media_processing_state: "coverage_processing",
      media_extraction_token: token,
      media_extraction_lease_expires_at: leaseExpiresAt,
      media_processing_updated_at: now,
    })
    .eq("id", input.submissionId)
    .eq("media_processing_state", "coverage_retry")
    .lte("media_extraction_available_at", now)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not claim media coverage retry: ${error.message}`);
  return data ? token : null;
}

export async function listSocialMediaWork(input: {
  supabase: SupabaseAdmin;
  limit?: number;
}): Promise<SocialMediaWorkSubmission[]> {
  const { error: recoveryError } = await input.supabase
    .from("social_spot_submissions")
    .update({
      media_processing_state: "succeeded",
      media_finalization_token: null,
      media_finalization_lease_expires_at: null,
      media_processing_updated_at: new Date().toISOString(),
    })
    .eq("media_processing_state", "finalizing")
    .lt("media_finalization_lease_expires_at", new Date().toISOString());
  if (recoveryError && !isOptionalMediaSchemaError(recoveryError)) {
    throw new Error(`Could not recover stale social media finalization: ${recoveryError.message}`);
  }

  const now = new Date().toISOString();
  const { error: extractionRecoveryError } = await input.supabase
    .from("social_spot_submissions")
    .update({
      media_processing_state: "coverage_retry",
      media_extraction_token: null,
      media_extraction_lease_expires_at: null,
      media_extraction_available_at: now,
      media_processing_updated_at: now,
    })
    .eq("media_processing_state", "coverage_processing")
    .lt("media_extraction_lease_expires_at", now);
  if (extractionRecoveryError && !isOptionalMediaSchemaError(extractionRecoveryError)) {
    throw new Error(`Could not recover stale media coverage retry: ${extractionRecoveryError.message}`);
  }

  const limit = Math.min(10, Math.max(1, input.limit || 3));
  const columns = "id, canonical_url, platform, media_processing_revision, media_processing_state, metadata, research, notes, city_hint";
  const { data: readyData, error: readyError } = await input.supabase.rpc(
    "list_ready_social_spot_media_work_v1",
    { p_limit: limit },
  );
  if (readyError) {
    if (isOptionalMediaSchemaError(readyError)) return [];
    throw new Error(`Could not list ready social media work: ${readyError.message}`);
  }
  const readyIds = (Array.isArray(readyData) ? readyData : readyData ? [readyData] : [])
    .map((row) => typeof row?.submission_id === "string" ? row.submission_id : null)
    .filter((id): id is string => Boolean(id));
  let rows: Array<Record<string, unknown>> = [];
  if (readyIds.length > 0) {
    const { data, error } = await input.supabase
      .from("social_spot_submissions")
      .select(columns)
      .in("id", readyIds);
    if (error) throw new Error(`Could not load ready social media work: ${error.message}`);
    const byId = new Map((data || []).map((row) => [String(row.id), row]));
    rows = readyIds.map((id) => byId.get(id)).filter(Boolean) as Array<Record<string, unknown>>;
  }
  if (rows.length < limit) {
    const terminal = await input.supabase
      .from("social_spot_submissions")
      .select(columns)
      .eq("media_processing_state", "dead_letter")
      .order("media_processing_updated_at", { ascending: true })
      .limit(limit - rows.length);
    if (terminal.error && !isOptionalMediaSchemaError(terminal.error)) {
      throw new Error(`Could not load failed social media work: ${terminal.error.message}`);
    }
    rows.push(...(terminal.data || []));
  }
  return rows.map((row) => ({
    id: String(row.id),
    canonicalUrl: String(row.canonical_url),
    platform: row.platform as "instagram" | "tiktok",
    revision: Number(row.media_processing_revision || 0),
    state: String(row.media_processing_state || "not_started"),
    metadata: row.metadata as SocialLinkMetadata,
    research: (row.research || {}) as Record<string, unknown>,
    notes: typeof row.notes === "string" ? row.notes : null,
    cityHint: typeof row.city_hint === "string" ? row.city_hint : null,
  }));
}

export async function loadSocialMediaProgress(input: {
  supabase: SupabaseAdmin;
  submissionId: string;
  revision: number;
}): Promise<SocialMediaProgressItem[]> {
  const { data, error } = await input.supabase
    .from("social_spot_submission_media_jobs")
    .select("id, submission_id, revision, ordinal, media_type, payload, state, attempt_count, max_attempts, available_at, last_error, result")
    .eq("submission_id", input.submissionId)
    .eq("revision", input.revision)
    .order("ordinal", { ascending: true });
  if (error) {
    if (isOptionalMediaSchemaError(error)) return [];
    throw new Error(`Could not load social media progress: ${error.message}`);
  }
  return (data || []).map((row) => {
    const payload = row.payload && typeof row.payload === "object"
      ? row.payload as Record<string, unknown>
      : {};
    const errorCode = typeof row.last_error === "string"
      ? row.last_error.split(":", 1)[0].slice(0, 80)
      : null;
    return {
      id: String(row.id),
      submissionId: String(row.submission_id),
      revision: Number(row.revision),
      ordinal: Number(row.ordinal),
      mediaKind: row.media_type === "video" ? "video" : "image",
      previewUrl: typeof payload.previewUrl === "string" ? payload.previewUrl : null,
      state: row.state as SocialMediaJobState,
      attemptCount: Number(row.attempt_count || 0),
      maxAttempts: Number(row.max_attempts || 5),
      availableAt: typeof row.available_at === "string" ? row.available_at : null,
      publicErrorCode: errorCode,
      result: row.result && typeof row.result === "object"
        ? row.result as { output?: string | null }
        : null,
    };
  });
}

export async function loadSocialMediaProgressForSubmissions(input: {
  supabase: SupabaseAdmin;
  submissionIds: string[];
}): Promise<Map<string, SocialMediaProgressItem[]>> {
  const result = new Map<string, SocialMediaProgressItem[]>();
  const submissionIds = Array.from(new Set(input.submissionIds)).slice(0, 20);
  if (submissionIds.length === 0) return result;
  const { data, error } = await input.supabase
    .from("social_spot_submission_media_jobs")
    .select("id, submission_id, revision, ordinal, media_type, payload, state, attempt_count, max_attempts, available_at, last_error, result")
    .in("submission_id", submissionIds)
    .order("ordinal", { ascending: true });
  if (error) {
    if (isOptionalMediaSchemaError(error)) return result;
    throw new Error(`Could not load social media progress: ${error.message}`);
  }
  for (const submissionId of submissionIds) {
    const rows = (data || []).filter((row) => row.submission_id === submissionId);
    const revision = rows.reduce(
      (latest, row) => Math.max(latest, Number(row.revision || 0)),
      0,
    );
    const currentRows = rows.filter((row) => Number(row.revision) === revision);
    const items = currentRows.map((row) => {
      const payload = row.payload && typeof row.payload === "object"
        ? row.payload as Record<string, unknown>
        : {};
      return {
        id: String(row.id),
        submissionId: String(row.submission_id),
        revision: Number(row.revision),
        ordinal: Number(row.ordinal),
        mediaKind: row.media_type === "video" ? "video" as const : "image" as const,
        previewUrl: typeof payload.previewUrl === "string" ? payload.previewUrl : null,
        state: row.state as SocialMediaJobState,
        attemptCount: Number(row.attempt_count || 0),
        maxAttempts: Number(row.max_attempts || 5),
        availableAt: typeof row.available_at === "string" ? row.available_at : null,
        publicErrorCode: typeof row.last_error === "string"
          ? row.last_error.split(":", 1)[0].slice(0, 80)
          : null,
        result: row.result && typeof row.result === "object"
          ? row.result as { output?: string | null }
          : null,
      };
    });
    if (items.length > 0) result.set(submissionId, items);
  }
  return result;
}

export async function claimReadySocialMediaFinalization(input: {
  supabase: SupabaseAdmin;
  submissionId: string;
  revision: number;
}): Promise<string | null> {
  const now = new Date().toISOString();
  const token = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
  const { data, error } = await input.supabase
    .from("social_spot_submissions")
    .update({
      media_processing_state: "finalizing",
      media_processing_started_at: now,
      media_finalization_token: token,
      media_finalization_lease_expires_at: leaseExpiresAt,
      media_processing_updated_at: now,
    })
    .eq("id", input.submissionId)
    .eq("media_processing_revision", input.revision)
    .eq("media_processing_state", "succeeded")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not claim social media finalization: ${error.message}`);
  return data ? token : null;
}

export async function settleSocialMediaFinalization(input: {
  supabase: SupabaseAdmin;
  submissionId: string;
  revision: number;
  finalizationToken: string;
  succeeded: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("social_spot_submissions")
    .update({
      media_processing_state: input.succeeded ? "completed" : "succeeded",
      media_finalization_token: null,
      media_finalization_lease_expires_at: null,
      media_processing_completed_at: input.succeeded ? now : null,
      media_processing_updated_at: now,
    })
    .eq("id", input.submissionId)
    .eq("media_processing_revision", input.revision)
    .eq("media_processing_state", "finalizing")
    .eq("media_finalization_token", input.finalizationToken)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not settle social media finalization: ${error.message}`);
  if (!data) throw new Error("Social media finalization token is stale or already settled.");
}
