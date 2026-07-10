import { NextRequest, NextResponse } from "next/server";
import { PATCH as finalizeSocialSubmission } from "@/app/api/spots/social-submissions/route";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import {
  assessSocialMediaCoverage,
  buildSocialMediaManifest,
  claimSocialMediaCoverageRetry,
  claimReadySocialMediaFinalization,
  claimSocialMediaJobs,
  completeSocialMediaJob,
  failSocialMediaJob,
  listSocialMediaWork,
  loadSocialMediaProgress,
  settleSocialMediaFinalization,
  syncSocialMediaManifest,
  type ClaimedSocialMediaJob,
  type SocialMediaWorkSubmission,
} from "@/lib/social-spot-media-jobs";
import {
  analyzeSocialImage,
  analyzeSocialImagesBatch,
  analyzeSocialVideo,
  enrichSocialLinkMetadataWithProvider,
  fetchSocialLinkMetadata,
} from "@/lib/social-spot-submissions";
import { createSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const WORKER_SOFT_BUDGET_MS = 100_000;
const MINIMUM_REFRESH_BUDGET_MS = 25_000;
const IMAGE_BATCH_SIZE = 10;
const VIDEO_BATCH_SIZE = 2;
const MAX_DRAIN_CYCLES = 6;
const MAX_IN_PROCESS_RETRY_WAIT_MS = 6_000;

type WorkerSummary = {
  inspected: number;
  claimed: number;
  succeeded: number;
  retried: number;
  finalized: number;
  deadLettered: number;
};

async function analyzeJob(
  job: ClaimedSocialMediaJob,
  sourceUrl: string,
  deadlineAt: number,
): Promise<string> {
  const output = job.mediaKind === "video"
    ? await analyzeSocialVideo({ videoUrl: sourceUrl, deadlineAt })
    : await analyzeSocialImage({ imageUrl: sourceUrl, deadlineAt });
  if (!output) throw new Error("Social media analysis returned no evidence output.");
  return output;
}

async function refreshSubmissionManifest(
  submission: SocialMediaWorkSubmission,
  deadlineAt: number,
): Promise<ReturnType<typeof buildSocialMediaManifest>> {
  const baseMetadata = await fetchSocialLinkMetadata(submission.canonicalUrl, {
    deadlineAt,
    includeInstagramProvider: false,
  });
  const refreshedMetadata = await enrichSocialLinkMetadataWithProvider(baseMetadata, {
    deadlineAt,
  });
  const currentManifest = buildSocialMediaManifest(submission.metadata);
  const refreshedManifest = buildSocialMediaManifest(refreshedMetadata);
  const identityMatches = currentManifest.length === refreshedManifest.length &&
    currentManifest.every((item, index) => {
      const refreshed = refreshedManifest[index];
      return Boolean(
        refreshed &&
        refreshed.mediaKey === item.mediaKey &&
        refreshed.mediaKind === item.mediaKind &&
        refreshed.inputFingerprint === item.inputFingerprint
      );
    });
  if (!identityMatches) {
    throw new Error("Refreshed media identity no longer matches the claimed revision.");
  }
  const supabase = createSupabaseAdmin();
  const synced = await syncSocialMediaManifest({
    supabase,
    submissionId: submission.id,
    metadata: refreshedMetadata,
  });
  if (!synced.queued || synced.revision !== submission.revision) {
    throw new Error("Refreshed media could not be fenced to the claimed revision.");
  }
  const { error } = await supabase
    .from("social_spot_submissions")
    .update({ metadata: refreshedMetadata })
    .eq("id", submission.id)
    .eq("media_processing_revision", submission.revision);
  if (error) throw new Error(`Could not persist refreshed media metadata: ${error.message}`);
  return refreshedManifest;
}

function outputByOrdinal(analyses: Array<{ ordinal: number; output: string }>) {
  return new Map(analyses.map((analysis) => [analysis.ordinal, analysis.output]));
}

async function settleImageJobs(input: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  jobs: ClaimedSocialMediaJob[];
  sourceUrls: Map<string, string>;
  deadlineAt: number;
  summary: WorkerSummary;
}): Promise<void> {
  const items = input.jobs.map((job) => ({
    ordinal: job.ordinal,
    imageUrl: input.sourceUrls.get(job.mediaKey) || job.sourceUrl,
  }));
  let analyses: Awaited<ReturnType<typeof analyzeSocialImagesBatch>> | null = null;
  try {
    analyses = await analyzeSocialImagesBatch({ items, deadlineAt: input.deadlineAt });
  } catch {
    // Fall through to independent analysis so one bad image cannot poison the batch.
  }
  if (analyses) {
    const outputs = outputByOrdinal(analyses);
    for (const job of input.jobs) {
      const output = outputs.get(job.ordinal);
      if (!output) throw new Error("Image batch analysis missed a claimed media item.");
      await completeSocialMediaJob({ supabase: input.supabase, job, output });
      input.summary.succeeded += 1;
    }
    return;
  }

  await Promise.all(input.jobs.map(async (job) => {
    try {
      const sourceUrl = input.sourceUrls.get(job.mediaKey) || job.sourceUrl;
      const output = await analyzeJob(job, sourceUrl, input.deadlineAt);
      await completeSocialMediaJob({ supabase: input.supabase, job, output });
      input.summary.succeeded += 1;
    } catch (error) {
      const state = await failSocialMediaJob({ supabase: input.supabase, job, error });
      if (state === "retry_wait") input.summary.retried += 1;
    }
  }));
}

async function processClaimedJobs(input: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  submission: SocialMediaWorkSubmission;
  imageJobs: ClaimedSocialMediaJob[];
  videoJobs: ClaimedSocialMediaJob[];
  deadlineAt: number;
  summary: WorkerSummary;
}): Promise<void> {
  let refreshedManifestPromise: Promise<ReturnType<typeof buildSocialMediaManifest>> | null = null;
  const getRefreshedManifest = () => {
    refreshedManifestPromise ||= refreshSubmissionManifest(input.submission, input.deadlineAt);
    return refreshedManifestPromise;
  };

  const imageTask = (async () => {
    if (input.imageJobs.length === 0) return;
    let sourceUrls = new Map(input.imageJobs.map((job) => [job.mediaKey, job.sourceUrl]));
    let initialAnalyses: Awaited<ReturnType<typeof analyzeSocialImagesBatch>> | null = null;
    try {
      initialAnalyses = await analyzeSocialImagesBatch({
        items: input.imageJobs.map((job) => ({
          ordinal: job.ordinal,
          imageUrl: job.sourceUrl,
        })),
        deadlineAt: input.deadlineAt,
      });
    } catch {
      // Refresh expiring provider URLs before splitting the batch into single items.
    }
    if (initialAnalyses) {
      const outputs = outputByOrdinal(initialAnalyses);
      for (const job of input.imageJobs) {
        const output = outputs.get(job.ordinal);
        if (!output) throw new Error("Image batch analysis missed a claimed media item.");
        await completeSocialMediaJob({ supabase: input.supabase, job, output });
        input.summary.succeeded += 1;
      }
      return;
    }
    if (input.deadlineAt - Date.now() >= MINIMUM_REFRESH_BUDGET_MS) {
      try {
        const refreshed = await getRefreshedManifest();
        sourceUrls = new Map(refreshed
          .filter((item) => input.imageJobs.some(
            (job) => job.mediaKey === item.mediaKey &&
              job.inputFingerprint === item.inputFingerprint,
          ))
          .map((item) => [item.mediaKey, item.sourceUrl]));
      } catch {
        // Individual analysis below records precise per-item outcomes.
      }
    }
    await settleImageJobs({ ...input, jobs: input.imageJobs, sourceUrls });
  })();

  const videoTask = Promise.all(input.videoJobs.map(async (job) => {
    try {
      let output: string;
      try {
        output = await analyzeJob(job, job.sourceUrl, input.deadlineAt);
      } catch (initialError) {
        if (input.deadlineAt - Date.now() < MINIMUM_REFRESH_BUDGET_MS) throw initialError;
        let refreshed: Awaited<ReturnType<typeof getRefreshedManifest>>;
        try {
          refreshed = await getRefreshedManifest();
        } catch {
          throw initialError;
        }
        const refreshedItem = refreshed.find((item) => item.mediaKey === job.mediaKey);
        if (
          !refreshedItem ||
          refreshedItem.inputFingerprint !== job.inputFingerprint ||
          refreshedItem.sourceUrl === job.sourceUrl
        ) throw initialError;
        output = await analyzeJob(job, refreshedItem.sourceUrl, input.deadlineAt);
      }
      await completeSocialMediaJob({ supabase: input.supabase, job, output });
      input.summary.succeeded += 1;
    } catch (error) {
      const state = await failSocialMediaJob({ supabase: input.supabase, job, error });
      if (state === "retry_wait") input.summary.retried += 1;
    }
  }));

  await Promise.all([imageTask, videoTask]);
}

async function finalizeReadySubmission(
  request: NextRequest,
  submission: SocialMediaWorkSubmission,
): Promise<boolean> {
  const supabase = createSupabaseAdmin();
  const finalizationToken = await claimReadySocialMediaFinalization({
    supabase,
    submissionId: submission.id,
    revision: submission.revision,
  });
  if (!finalizationToken) return false;

  const cronSecret = process.env.CRON_SECRET as string;
  const internalRequest = new NextRequest(
    new URL("/api/spots/social-submissions", request.url),
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${cronSecret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        submissionId: submission.id,
        canonicalUrl: submission.canonicalUrl,
        mediaRevision: submission.revision,
        finalizationToken,
        notes: "Automatic final research after every queued media item completed.",
      }),
    },
  );
  const response = await finalizeSocialSubmission(internalRequest);
  await settleSocialMediaFinalization({
    supabase,
    submissionId: submission.id,
    revision: submission.revision,
    finalizationToken,
    succeeded: response.ok,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      `Aggregate social research failed with ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return true;
}

async function checkpointDeadLetter(
  submission: SocialMediaWorkSubmission,
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const media = await loadSocialMediaProgress({
    supabase,
    submissionId: submission.id,
    revision: submission.revision,
  });
  const succeeded = media.filter((item) => item.state === "succeeded").length;
  const failed = media.filter((item) => item.state === "dead_letter").length;
  const research = {
    ...submission.research,
    mediaProcessing: {
      state: "failed",
      revision: submission.revision,
      total: media.length,
      succeeded,
      failed,
    },
  };
  const { error } = await supabase
    .from("social_spot_submissions")
    .update({
      status: "needs_review",
      media_processing_state: "review_required",
      media_processing_completed_at: new Date().toISOString(),
      media_finalization_token: null,
      media_finalization_lease_expires_at: null,
      research,
      research_summary:
        `Media processing finished with ${failed} item${failed === 1 ? "" : "s"} unavailable.`,
    })
    .eq("id", submission.id)
    .eq("media_processing_revision", submission.revision);
  if (error) throw new Error(`Could not checkpoint failed media coverage: ${error.message}`);
}

async function retryIncompleteCoverage(
  submission: SocialMediaWorkSubmission,
  deadlineAt: number,
  extractionToken: string,
): Promise<SocialMediaWorkSubmission | null> {
  const supabase = createSupabaseAdmin();
  let metadata = submission.metadata;
  const storedCoverage = assessSocialMediaCoverage(metadata);
  if (!storedCoverage.complete) {
    try {
      const baseMetadata = await fetchSocialLinkMetadata(submission.canonicalUrl, {
        includeInstagramProvider: false,
        deadlineAt,
      });
      metadata = await enrichSocialLinkMetadataWithProvider(baseMetadata, { deadlineAt });
    } catch {
      // Reuse the last truthful metadata snapshot to advance bounded retry state.
    }
  }
  const queued = await syncSocialMediaManifest({
    supabase,
    submissionId: submission.id,
    metadata,
    extractionToken,
  });
  const research = {
    ...submission.research,
    mediaProcessing: {
      state: queued.state,
      revision: queued.revision,
      total: queued.total,
      expected: queued.coverage.expectedCount,
      coverage: queued.coverage.reason,
    },
  };
  const { error } = await supabase
    .from("social_spot_submissions")
    .update({
      metadata,
      research,
      status: "needs_review",
      research_summary: queued.state === "review_required"
        ? "Localley could not retrieve every media item after bounded retries."
        : "Retrying complete social-post media extraction.",
    })
    .eq("id", submission.id);
  if (error) throw new Error(`Could not checkpoint media coverage retry: ${error.message}`);
  if (!queued.queued) return null;
  return {
    ...submission,
    metadata,
    revision: queued.revision,
    state: queued.state,
    research,
  };
}

export async function GET(request: NextRequest) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const deadlineAt = Date.now() + WORKER_SOFT_BUDGET_MS;
  const supabase = createSupabaseAdmin();
  const submissions = await listSocialMediaWork({ supabase, limit: 3 });
  const summary: WorkerSummary = {
    inspected: submissions.length,
    claimed: 0,
    succeeded: 0,
    retried: 0,
    finalized: 0,
    deadLettered: 0,
  };

  for (let submission of submissions) {
    if (deadlineAt - Date.now() < MINIMUM_REFRESH_BUDGET_MS) break;
    if (submission.state === "coverage_retry") {
      const extractionToken = await claimSocialMediaCoverageRetry({
        supabase,
        submissionId: submission.id,
      });
      if (!extractionToken) continue;
      const retriedSubmission = await retryIncompleteCoverage(
        submission,
        deadlineAt,
        extractionToken,
      );
      summary.retried += 1;
      if (!retriedSubmission) continue;
      submission = retriedSubmission;
    }
    if (submission.state === "dead_letter") {
      await checkpointDeadLetter(submission);
      summary.deadLettered += 1;
      continue;
    }
    if (submission.state === "succeeded") {
      if (await finalizeReadySubmission(request, submission)) summary.finalized += 1;
      continue;
    }

    for (let cycle = 0; cycle < MAX_DRAIN_CYCLES; cycle += 1) {
      if (deadlineAt - Date.now() < MINIMUM_REFRESH_BUDGET_MS) break;
      const progress = await loadSocialMediaProgress({
        supabase,
        submissionId: submission.id,
        revision: submission.revision,
      });
      if (progress.length === 0) break;
      if (progress.some((item) => item.state === "dead_letter")) {
        await checkpointDeadLetter(submission);
        summary.deadLettered += 1;
        break;
      }
      if (progress.every((item) => item.state === "succeeded")) {
        if (await finalizeReadySubmission(request, {
          ...submission,
          state: "succeeded",
        })) summary.finalized += 1;
        break;
      }

      const imageJobs = await claimSocialMediaJobs({
        supabase,
        submissionId: submission.id,
        revision: submission.revision,
        mediaKind: "image",
        limit: IMAGE_BATCH_SIZE,
        leaseSeconds: 180,
      });
      const videoJobs = await claimSocialMediaJobs({
        supabase,
        submissionId: submission.id,
        revision: submission.revision,
        mediaKind: "video",
        limit: VIDEO_BATCH_SIZE,
        leaseSeconds: 180,
      });
      const claimedCount = imageJobs.length + videoJobs.length;
      if (claimedCount === 0) {
        const nextRetryAt = progress
          .filter((item) => item.state === "retry_wait" && item.availableAt)
          .map((item) => new Date(item.availableAt as string).getTime())
          .filter(Number.isFinite)
          .sort((left, right) => left - right)[0];
        const waitMs = nextRetryAt ? Math.max(0, nextRetryAt - Date.now()) : Infinity;
        if (
          waitMs <= MAX_IN_PROCESS_RETRY_WAIT_MS &&
          deadlineAt - Date.now() > waitMs + MINIMUM_REFRESH_BUDGET_MS
        ) {
          await new Promise((resolve) => setTimeout(resolve, waitMs + 50));
          continue;
        }
        break;
      }
      summary.claimed += claimedCount;
      await processClaimedJobs({
        supabase,
        submission,
        imageJobs,
        videoJobs,
        deadlineAt,
        summary,
      });
      const settledProgress = await loadSocialMediaProgress({
        supabase,
        submissionId: submission.id,
        revision: submission.revision,
      });
      if (settledProgress.some((item) => item.state === "dead_letter")) {
        await checkpointDeadLetter(submission);
        summary.deadLettered += 1;
        break;
      }
      if (
        settledProgress.length > 0 &&
        settledProgress.every((item) => item.state === "succeeded")
      ) {
        if (await finalizeReadySubmission(request, {
          ...submission,
          state: "succeeded",
        })) summary.finalized += 1;
        break;
      }
    }
  }

  return NextResponse.json({ success: true, ...summary });
}
