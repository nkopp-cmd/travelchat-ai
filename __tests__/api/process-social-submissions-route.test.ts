import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdmin: vi.fn(),
  updatePayloads: [] as Array<Record<string, unknown>>,
  listSocialMediaWork: vi.fn(),
  loadSocialMediaProgress: vi.fn(),
  claimSocialMediaJobs: vi.fn(),
  claimSocialMediaCoverageRetry: vi.fn(async () => "extraction-token"),
  completeSocialMediaJob: vi.fn(async () => true),
  failSocialMediaJob: vi.fn(async () => "retry_wait" as const),
  claimReadySocialMediaFinalization: vi.fn(async () => "finalization-token"),
  settleSocialMediaFinalization: vi.fn(async () => undefined),
  syncSocialMediaManifest: vi.fn(),
  assessSocialMediaCoverage: vi.fn(() => ({
    complete: false,
    expectedCount: 0,
    extractedCount: 0,
    reason: "no_media",
  })),
  buildSocialMediaManifest: vi.fn(() => []),
  analyzeSocialImagesBatch: vi.fn(),
  analyzeSocialImage: vi.fn(),
  analyzeSocialVideo: vi.fn(),
  fetchSocialLinkMetadata: vi.fn(),
  enrichSocialLinkMetadataWithProvider: vi.fn(),
  finalizeSocialSubmission: vi.fn(async () => NextResponse.json({ success: true })),
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
}));

vi.mock("@/lib/social-spot-media-jobs", () => ({
  assessSocialMediaCoverage: mocks.assessSocialMediaCoverage,
  buildSocialMediaManifest: mocks.buildSocialMediaManifest,
  listSocialMediaWork: mocks.listSocialMediaWork,
  loadSocialMediaProgress: mocks.loadSocialMediaProgress,
  claimSocialMediaJobs: mocks.claimSocialMediaJobs,
  claimSocialMediaCoverageRetry: mocks.claimSocialMediaCoverageRetry,
  completeSocialMediaJob: mocks.completeSocialMediaJob,
  failSocialMediaJob: mocks.failSocialMediaJob,
  claimReadySocialMediaFinalization: mocks.claimReadySocialMediaFinalization,
  settleSocialMediaFinalization: mocks.settleSocialMediaFinalization,
  syncSocialMediaManifest: mocks.syncSocialMediaManifest,
}));

vi.mock("@/lib/social-spot-submissions", () => ({
  analyzeSocialImagesBatch: mocks.analyzeSocialImagesBatch,
  analyzeSocialImage: mocks.analyzeSocialImage,
  analyzeSocialVideo: mocks.analyzeSocialVideo,
  fetchSocialLinkMetadata: mocks.fetchSocialLinkMetadata,
  enrichSocialLinkMetadataWithProvider: mocks.enrichSocialLinkMetadataWithProvider,
}));

vi.mock("@/app/api/spots/social-submissions/route", () => ({
  PATCH: mocks.finalizeSocialSubmission,
}));

const submission = {
  id: "11111111-1111-4111-8111-111111111111",
  canonicalUrl: "https://www.instagram.com/p/MIXED123",
  platform: "instagram" as const,
  revision: 1,
  state: "processing",
  metadata: {
    finalUrl: "https://www.instagram.com/p/MIXED123",
  },
  research: {},
  notes: null,
  cityHint: "Seoul",
};

function job(kind: "image" | "video", ordinal: number) {
  return {
    jobId: `job-${kind}-${ordinal}`,
    claimToken: `11111111-1111-4111-8111-11111111111${ordinal}`,
    submissionId: submission.id,
    revision: 1,
    mediaId: `media-${kind}-${ordinal}`,
    mediaKey: `${kind}:${ordinal}`,
    inputFingerprint: `fingerprint-${kind}-${ordinal}`,
    ordinal,
    mediaKind: kind,
    sourceUrl: `https://scontent.cdninstagram.com/v/${kind}/${ordinal}.mp4`,
    attemptCount: 1,
    maxAttempts: 5,
  };
}

function progress(stateByKind: Record<"image" | "video", string>) {
  return (["image", "video"] as const).map((kind, ordinal) => ({
    id: `job-${kind}-${ordinal}`,
    submissionId: submission.id,
    revision: 1,
    ordinal,
    mediaKind: kind,
    previewUrl: null,
    state: stateByKind[kind],
    attemptCount: stateByKind[kind] === "queued" ? 0 : 1,
    maxAttempts: 5,
    availableAt: new Date(Date.now() + 60_000).toISOString(),
    publicErrorCode: null,
    result: stateByKind[kind] === "succeeded" ? { output: `${kind} evidence` } : null,
  }));
}

function request(secret = "worker-secret") {
  return new NextRequest("https://www.localley.io/api/cron/process-social-submissions", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("social submission media worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatePayloads.length = 0;
    mocks.createSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          mocks.updatePayloads.push(payload);
          const query = {
            eq: vi.fn(() => query),
            then: (resolve: (value: { error: null }) => unknown) =>
              Promise.resolve(resolve({ error: null })),
          };
          return query;
        }),
      })),
    });
    process.env.CRON_SECRET = "worker-secret";
    delete process.env.APIFY_API_TOKEN;
    mocks.listSocialMediaWork.mockResolvedValue([submission]);
    mocks.claimSocialMediaJobs.mockImplementation(async ({ mediaKind }) => [
      job(mediaKind, mediaKind === "image" ? 0 : 1),
    ]);
    mocks.analyzeSocialImagesBatch.mockResolvedValue([
      { ordinal: 0, imageUrl: job("image", 0).sourceUrl, output: "image evidence" },
    ]);
    mocks.analyzeSocialVideo.mockResolvedValue("video evidence");
    mocks.syncSocialMediaManifest.mockResolvedValue({
      available: true,
      queued: true,
      workerRequired: true,
      coverage: { complete: true, expectedCount: 2, extractedCount: 2, reason: "complete" },
      total: 2,
      revision: 1,
      state: "queued",
    });
    mocks.loadSocialMediaProgress
      .mockResolvedValueOnce(progress({ image: "queued", video: "queued" }))
      .mockResolvedValueOnce(progress({ image: "succeeded", video: "succeeded" }));
  });

  it("fails closed when the cron bearer secret is wrong", async () => {
    const { GET } = await import("@/app/api/cron/process-social-submissions/route");

    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.listSocialMediaWork).not.toHaveBeenCalled();
  });

  it("processes mixed media with type-specific claims and finalizes only after all succeed", async () => {
    const { GET } = await import("@/app/api/cron/process-social-submissions/route");

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      inspected: 1,
      claimed: 2,
      succeeded: 2,
      finalized: 1,
    });
    expect(mocks.claimSocialMediaJobs).toHaveBeenCalledWith(
      expect.objectContaining({ mediaKind: "image", limit: 10 }),
    );
    expect(mocks.claimSocialMediaJobs).toHaveBeenCalledWith(
      expect.objectContaining({ mediaKind: "video", limit: 2 }),
    );
    expect(mocks.completeSocialMediaJob).toHaveBeenCalledTimes(2);
    expect(mocks.claimReadySocialMediaFinalization).toHaveBeenCalledOnce();
    expect(mocks.finalizeSocialSubmission).toHaveBeenCalledOnce();
    const internalRequest = mocks.finalizeSocialSubmission.mock.calls[0][0] as NextRequest;
    expect(internalRequest.headers.get("authorization")).toBe("Bearer worker-secret");
    await expect(internalRequest.json()).resolves.toMatchObject({
      mediaRevision: 1,
      finalizationToken: "finalization-token",
    });
    expect(mocks.settleSocialMediaFinalization).toHaveBeenCalledWith(
      expect.objectContaining({
        finalizationToken: "finalization-token",
        succeeded: true,
      }),
    );
  });

  it("retries incomplete provider coverage and immediately processes a recovered manifest", async () => {
    const coverageSubmission = {
      ...submission,
      state: "coverage_retry",
      metadata: {
        ...submission.metadata,
        imageUrl: "https://scontent.cdninstagram.com/v/image/cover.jpg",
        mediaCompleteness: "partial" as const,
        mediaItemCount: 2,
        mediaExtractedCount: 1,
      },
    };
    const recoveredMetadata = {
      ...coverageSubmission.metadata,
      mediaUrls: [
        "https://scontent.cdninstagram.com/v/image/one.jpg",
        "https://scontent.cdninstagram.com/v/image/two.jpg",
      ],
      mediaCompleteness: "complete" as const,
      mediaExtractedCount: 2,
    };
    mocks.listSocialMediaWork.mockResolvedValueOnce([coverageSubmission]);
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce(recoveredMetadata);
    mocks.enrichSocialLinkMetadataWithProvider.mockResolvedValueOnce(recoveredMetadata);
    mocks.syncSocialMediaManifest.mockResolvedValueOnce({
      available: true,
      queued: true,
      workerRequired: true,
      coverage: { complete: true, expectedCount: 2, extractedCount: 2, reason: "complete" },
      total: 2,
      revision: 2,
      state: "queued",
    });
    const imageJobs = [job("image", 0), job("image", 1)];
    mocks.claimSocialMediaJobs.mockImplementation(async ({ mediaKind }) =>
      mediaKind === "image" ? imageJobs : [],
    );
    mocks.analyzeSocialImagesBatch.mockResolvedValueOnce([
      { ordinal: 0, imageUrl: imageJobs[0].sourceUrl, output: "first image" },
      { ordinal: 1, imageUrl: imageJobs[1].sourceUrl, output: "second image" },
    ]);
    const queuedProgress = imageJobs.map((claimedJob) => ({
      id: claimedJob.jobId,
      submissionId: submission.id,
      revision: 2,
      ordinal: claimedJob.ordinal,
      mediaKind: "image" as const,
      previewUrl: null,
      state: "queued",
      attemptCount: 0,
      maxAttempts: 5,
      availableAt: new Date().toISOString(),
      publicErrorCode: null,
      result: null,
    }));
    mocks.loadSocialMediaProgress.mockReset();
    mocks.loadSocialMediaProgress
      .mockResolvedValueOnce(queuedProgress)
      .mockResolvedValueOnce(queuedProgress.map((item, index) => ({
        ...item,
        state: "succeeded",
        result: { output: index === 0 ? "first image" : "second image" },
      })));

    const { GET } = await import("@/app/api/cron/process-social-submissions/route");
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ claimed: 2, succeeded: 2, finalized: 1 });
    expect(mocks.syncSocialMediaManifest).toHaveBeenCalledWith(expect.objectContaining({
      submissionId: submission.id,
      metadata: recoveredMetadata,
      extractionToken: "extraction-token",
    }));
    expect(mocks.updatePayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({ metadata: recoveredMetadata }),
    ]));
  });

  it("admits a complete stored manifest without another provider request", async () => {
    const storedMetadata = {
      ...submission.metadata,
      imageUrl: "https://scontent.cdninstagram.com/v/image/one.jpg",
      mediaUrls: ["https://scontent.cdninstagram.com/v/image/one.jpg"],
      mediaCompleteness: "complete" as const,
      mediaItemCount: 1,
      mediaExtractedCount: 1,
    };
    const coverageSubmission = {
      ...submission,
      state: "coverage_retry",
      metadata: storedMetadata,
    };
    const imageJob = job("image", 0);
    const queuedProgress = [{
      id: imageJob.jobId,
      submissionId: submission.id,
      revision: 2,
      ordinal: 0,
      mediaKind: "image" as const,
      previewUrl: null,
      state: "queued",
      attemptCount: 0,
      maxAttempts: 5,
      availableAt: new Date().toISOString(),
      publicErrorCode: null,
      result: null,
    }];
    mocks.listSocialMediaWork.mockResolvedValueOnce([coverageSubmission]);
    mocks.assessSocialMediaCoverage.mockReturnValueOnce({
      complete: true,
      expectedCount: 1,
      extractedCount: 1,
      reason: "complete",
    });
    mocks.syncSocialMediaManifest.mockResolvedValueOnce({
      available: true,
      queued: true,
      workerRequired: true,
      coverage: { complete: true, expectedCount: 1, extractedCount: 1, reason: "complete" },
      total: 1,
      revision: 2,
      state: "queued",
    });
    mocks.claimSocialMediaJobs.mockImplementation(async ({ mediaKind }) =>
      mediaKind === "image" ? [imageJob] : [],
    );
    mocks.loadSocialMediaProgress.mockReset();
    mocks.loadSocialMediaProgress
      .mockResolvedValueOnce(queuedProgress)
      .mockResolvedValueOnce(queuedProgress.map((item) => ({
        ...item,
        state: "succeeded",
        result: { output: "stored image evidence" },
      })));

    const { GET } = await import("@/app/api/cron/process-social-submissions/route");
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.fetchSocialLinkMetadata).not.toHaveBeenCalled();
    expect(mocks.enrichSocialLinkMetadataWithProvider).not.toHaveBeenCalled();
    expect(mocks.syncSocialMediaManifest).toHaveBeenCalledWith(expect.objectContaining({
      metadata: storedMetadata,
      extractionToken: "extraction-token",
    }));
  });

  it("persists refreshed signed URLs only when stable media fingerprints still match", async () => {
    const videoJob = {
      ...job("video", 0),
      sourceUrl: "https://scontent.cdninstagram.com/v/video/one.mp4?sig=old",
      inputFingerprint: "stable-video-fingerprint",
    };
    const refreshedMetadata = {
      ...submission.metadata,
      videoUrls: ["https://scontent.cdninstagram.com/v/video/one.mp4?sig=new"],
    };
    const currentManifest = [{
      ordinal: 0,
      mediaKey: "video:0",
      mediaKind: "video" as const,
      sourceUrl: videoJob.sourceUrl,
      previewUrl: null,
      inputFingerprint: "stable-video-fingerprint",
    }];
    const refreshedManifest = [{
      ...currentManifest[0],
      sourceUrl: refreshedMetadata.videoUrls[0],
    }];
    mocks.claimSocialMediaJobs.mockImplementation(async ({ mediaKind }) =>
      mediaKind === "video" ? [videoJob] : [],
    );
    mocks.analyzeSocialVideo
      .mockRejectedValueOnce(new Error("signed URL expired"))
      .mockResolvedValueOnce("refreshed video evidence");
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce(refreshedMetadata);
    mocks.enrichSocialLinkMetadataWithProvider.mockResolvedValueOnce(refreshedMetadata);
    mocks.buildSocialMediaManifest
      .mockReturnValueOnce(currentManifest)
      .mockReturnValueOnce(refreshedManifest);
    const queuedVideo = [{
      id: videoJob.jobId,
      submissionId: submission.id,
      revision: 1,
      ordinal: 0,
      mediaKind: "video" as const,
      previewUrl: null,
      state: "queued",
      attemptCount: 0,
      maxAttempts: 5,
      availableAt: new Date().toISOString(),
      publicErrorCode: null,
      result: null,
    }];
    mocks.loadSocialMediaProgress.mockReset();
    mocks.loadSocialMediaProgress
      .mockResolvedValueOnce(queuedVideo)
      .mockResolvedValueOnce(queuedVideo.map((item) => ({
        ...item,
        state: "succeeded",
        result: { output: "refreshed video evidence" },
      })));

    const { GET } = await import("@/app/api/cron/process-social-submissions/route");
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.analyzeSocialVideo).toHaveBeenNthCalledWith(2, expect.objectContaining({
      videoUrl: refreshedMetadata.videoUrls[0],
    }));
    expect(mocks.syncSocialMediaManifest).toHaveBeenCalledWith(expect.objectContaining({
      metadata: refreshedMetadata,
    }));
    expect(mocks.updatePayloads).toContainEqual({ metadata: refreshedMetadata });
  });

  it("preserves the original media-access failure when manifest refresh fails", async () => {
    const videoJob = job("video", 0);
    let claimed = false;
    mocks.claimSocialMediaJobs.mockImplementation(async ({ mediaKind }) => {
      if (mediaKind !== "video" || claimed) return [];
      claimed = true;
      return [videoJob];
    });
    const accessError = new Error("403 Forbidden");
    mocks.analyzeSocialVideo.mockRejectedValueOnce(accessError);
    mocks.fetchSocialLinkMetadata.mockRejectedValueOnce(new Error("metadata refresh failed"));
    const retryingProgress = [{
      ...progress({ image: "queued", video: "retry_wait" })[1],
      ordinal: 0,
    }];
    mocks.loadSocialMediaProgress.mockReset();
    mocks.loadSocialMediaProgress
      .mockResolvedValueOnce([{
        ...progress({ image: "queued", video: "queued" })[1],
        ordinal: 0,
      }])
      .mockResolvedValueOnce(retryingProgress)
      .mockResolvedValueOnce(retryingProgress);

    const { GET } = await import("@/app/api/cron/process-social-submissions/route");
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ claimed: 1, succeeded: 0, retried: 1 });
    expect(mocks.failSocialMediaJob).toHaveBeenCalledWith(expect.objectContaining({
      error: accessError,
    }));
  });

  it("falls back to per-image analysis so one bad carousel image does not poison the batch", async () => {
    const imageJobs = [job("image", 0), job("image", 1)];
    let imageBatchClaimed = false;
    mocks.claimSocialMediaJobs.mockImplementation(async ({ mediaKind }) => {
      if (mediaKind !== "image" || imageBatchClaimed) return [];
      imageBatchClaimed = true;
      return imageJobs;
    });
    mocks.analyzeSocialImagesBatch.mockRejectedValue(new Error("batch image unavailable"));
    mocks.fetchSocialLinkMetadata.mockResolvedValue(submission.metadata);
    mocks.enrichSocialLinkMetadataWithProvider.mockResolvedValue(submission.metadata);
    mocks.buildSocialMediaManifest.mockReturnValue([]);
    mocks.analyzeSocialImage
      .mockResolvedValueOnce("first image evidence")
      .mockRejectedValueOnce(new Error("unsupported image"));
    const retryingProgress = [
      {
        ...progress({ image: "succeeded", video: "queued" })[0],
        result: { output: "first image evidence" },
      },
      {
        ...progress({ image: "queued", video: "retry_wait" })[1],
        id: "job-image-1",
        mediaKind: "image" as const,
        ordinal: 1,
        state: "retry_wait",
        result: null,
      },
    ];
    mocks.loadSocialMediaProgress.mockReset();
    mocks.loadSocialMediaProgress
      .mockResolvedValueOnce(retryingProgress.map((item) => ({ ...item, state: "queued" })))
      .mockResolvedValueOnce(retryingProgress)
      .mockResolvedValueOnce(retryingProgress);

    const { GET } = await import("@/app/api/cron/process-social-submissions/route");
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ claimed: 2, succeeded: 1, retried: 1, finalized: 0 });
    expect(mocks.analyzeSocialImage).toHaveBeenCalledTimes(2);
    expect(mocks.completeSocialMediaJob).toHaveBeenCalledTimes(1);
    expect(mocks.failSocialMediaJob).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeSocialSubmission).not.toHaveBeenCalled();
  });
});
