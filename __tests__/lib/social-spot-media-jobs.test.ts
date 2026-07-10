import { describe, expect, it, vi } from "vitest";
import {
  assessSocialMediaCoverage,
  buildSocialMediaManifest,
  claimReadySocialMediaFinalization,
  claimSocialMediaCoverageRetry,
  claimSocialMediaJobs,
  classifySocialMediaJobError,
  failSocialMediaJob,
  listSocialMediaWork,
  loadSocialMediaProcessingForSubmissions,
  scheduleLegacySocialMediaBackfill,
  SOCIAL_MEDIA_MANIFEST_LIMIT,
  settleSocialMediaFinalization,
  syncSocialMediaManifest,
} from "@/lib/social-spot-media-jobs";

describe("social spot media jobs", () => {
  it("builds a stable bounded manifest for trusted images and videos", () => {
    const imageOne = "https://scontent.cdninstagram.com/v/image/one.jpg?sig=1";
    const imageOneRotated = "https://scontent.cdninstagram.com/v/image/one.jpg?sig=2";
    const imageTwo = "https://instagram.ficn3-2.fna.fbcdn.net/v/image/two.jpg";
    const video = "https://scontent.cdninstagram.com/v/video/one.mp4?sig=1";

    const manifest = buildSocialMediaManifest({
      title: "Mixed carousel",
      description: null,
      imageUrl: imageOne,
      mediaUrls: [imageOne, imageOneRotated, imageTwo, "https://example.com/untrusted.jpg"],
      videoUrl: video,
      videoUrls: [video],
      finalUrl: "https://www.instagram.com/p/MIXED123",
    });

    expect(manifest).toHaveLength(3);
    expect(manifest.map((item) => [item.ordinal, item.mediaKey, item.mediaKind])).toEqual([
      [0, "image:0", "image"],
      [1, "image:1", "image"],
      [2, "video:0", "video"],
    ]);
    expect(manifest[0].inputFingerprint).toHaveLength(64);
  });

  it("does not duplicate the same provider URL as both an image and a video", () => {
    const video = "https://scontent.cdninstagram.com/v/video/one.mp4?sig=1";
    const manifest = buildSocialMediaManifest({
      title: "Video post",
      description: null,
      imageUrl: null,
      mediaUrls: [video],
      videoUrls: [video],
      mediaAccessStatus: "video_ready",
      finalUrl: "https://www.instagram.com/reel/VIDEO123",
    });

    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({ mediaKind: "video", mediaKey: "video:0" });
  });

  it("marks provider count mismatches and cover-only extraction incomplete", () => {
    const metadata = {
      title: "Partial carousel",
      description: null,
      imageUrl: "https://scontent.cdninstagram.com/v/image/one.jpg",
      mediaUrls: ["https://scontent.cdninstagram.com/v/image/one.jpg"],
      mediaAccessStatus: "carousel_images" as const,
      mediaCompleteness: "partial" as const,
      mediaItemCount: 5,
      mediaExtractedCount: 1,
      finalUrl: "https://www.instagram.com/p/PARTIAL123",
    };

    expect(assessSocialMediaCoverage(metadata)).toEqual({
      complete: false,
      expectedCount: 5,
      extractedCount: 1,
      reason: "provider_partial",
    });
    expect(assessSocialMediaCoverage({
      ...metadata,
      mediaCompleteness: undefined,
      mediaItemCount: undefined,
      mediaExtractedCount: undefined,
      mediaAccessStatus: "cover_only",
    })).toMatchObject({ complete: false, reason: "cover_only" });
  });

  it("requires explicit image-post coverage before admitting image-only TikTok media", () => {
    const imageOne = "https://p16-sign.tiktokcdn-us.com/video/cover.jpeg";
    const imageTwo = "https://p16-sign.tiktokcdn-us.com/video/alternate.jpeg";
    const unverified = {
      title: "Video thumbnails",
      description: null,
      imageUrl: imageOne,
      mediaUrls: [imageOne, imageTwo],
      mediaAccessStatus: "carousel_images" as const,
      finalUrl: "https://www.tiktok.com/@localley/video/123456789",
    };

    expect(assessSocialMediaCoverage(unverified)).toMatchObject({
      complete: false,
      reason: "provider_partial",
    });
    expect(assessSocialMediaCoverage({
      ...unverified,
      mediaUrls: [imageOne],
      mediaAccessStatus: undefined,
    })).toMatchObject({
      complete: false,
      reason: "cover_only",
    });
  });

  it("admits counted TikTok photo posts without requiring a video", () => {
    const image = "https://p16-sign.tiktokcdn-us.com/photo/one.jpeg";
    expect(assessSocialMediaCoverage({
      title: "One-photo post",
      description: null,
      imageUrl: image,
      mediaUrls: [image],
      mediaAccessStatus: "carousel_images",
      mediaCompleteness: "complete",
      mediaItemCount: 1,
      mediaExtractedCount: 1,
      finalUrl: "https://www.tiktok.com/@localley/photo/987654321",
    })).toEqual({
      complete: true,
      expectedCount: 1,
      extractedCount: 1,
      reason: "complete",
    });
  });

  it("preserves valid legacy TikTok photo carousels without new counters", () => {
    const images = [
      "https://p16-sign.tiktokcdn-us.com/photo/one.jpeg",
      "https://p16-sign.tiktokcdn-us.com/photo/two.jpeg",
    ];
    expect(assessSocialMediaCoverage({
      title: "Legacy photo carousel",
      description: null,
      imageUrl: images[0],
      mediaUrls: images,
      mediaAccessStatus: "carousel_images",
      finalUrl: "https://www.tiktok.com/@localley/photo/987654321",
    })).toEqual({
      complete: true,
      expectedCount: 2,
      extractedCount: 2,
      reason: "complete",
    });
  });

  it("does not queue a partial provider manifest", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        processing_state: "coverage_retry",
        attempt_count: 1,
        available_at: new Date().toISOString(),
      }],
      error: null,
    }));
    const result = await syncSocialMediaManifest({
      supabase: { rpc } as never,
      submissionId: "11111111-1111-4111-8111-111111111111",
      metadata: {
        title: "Partial carousel",
        description: null,
        imageUrl: "https://scontent.cdninstagram.com/v/image/one.jpg",
        mediaUrls: ["https://scontent.cdninstagram.com/v/image/one.jpg"],
        mediaCompleteness: "partial",
        mediaItemCount: 3,
        mediaExtractedCount: 1,
        finalUrl: "https://www.instagram.com/p/PARTIAL123",
      },
    });

    expect(result).toMatchObject({
      available: true,
      queued: false,
      workerRequired: true,
      total: 1,
      revision: 0,
      state: "coverage_retry",
      coverage: { complete: false, expectedCount: 3 },
    });
    expect(rpc).toHaveBeenCalledWith("defer_social_spot_media_coverage_v1", {
      p_submission_id: "11111111-1111-4111-8111-111111111111",
      p_extracted_count: 1,
      p_expected_count: 3,
      p_reason: "provider_partial",
      p_extraction_token: null,
    });
  });

  it("preserves all 35 supported items and safely caps larger manifests", () => {
    const mediaUrls = Array.from(
      { length: 40 },
      (_, index) => `https://scontent.cdninstagram.com/v/image/${index}.jpg`,
    );

    const manifest = buildSocialMediaManifest({
      title: "Large carousel",
      description: null,
      imageUrl: mediaUrls[0],
      mediaUrls,
      finalUrl: "https://www.instagram.com/p/LARGE123",
    });

    expect(manifest).toHaveLength(SOCIAL_MEDIA_MANIFEST_LIMIT);
    expect(assessSocialMediaCoverage({
      title: "Large carousel",
      description: null,
      imageUrl: mediaUrls[0],
      mediaUrls,
      finalUrl: "https://www.instagram.com/p/LARGE123",
    }, manifest)).toMatchObject({
      complete: false,
      expectedCount: 40,
      extractedCount: 35,
      reason: "count_mismatch",
    });
  });

  it("falls back conservatively while the media schema is unavailable", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "PGRST202", message: "function was not found" },
    }));

    const result = await syncSocialMediaManifest({
      supabase: { rpc } as never,
      submissionId: "11111111-1111-4111-8111-111111111111",
      metadata: {
        title: "One image",
        description: null,
        imageUrl: "https://scontent.cdninstagram.com/v/image/one.jpg",
        finalUrl: "https://www.instagram.com/p/ONE123",
      },
    });

    expect(result).toEqual({
      available: false,
      queued: false,
      workerRequired: false,
      coverage: {
        complete: true,
        expectedCount: 1,
        extractedCount: 1,
        reason: "complete",
      },
      total: 1,
      revision: 0,
      state: "schema_unavailable",
    });
  });

  it("normalizes fenced job claims returned by Postgres", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        job_id: "job-1",
        claim_token: "claim-1",
        submission_id: "submission-1",
        revision: 2,
        media_id: "media-1",
        media_key: "video:0",
        fingerprint: "fingerprint-1",
        ordinal: 3,
        media_kind: "video",
        source_url: "https://scontent.cdninstagram.com/v/video/one.mp4",
        attempt_count: 2,
        max_attempts: 3,
      }],
      error: null,
    }));

    const jobs = await claimSocialMediaJobs({
      supabase: { rpc } as never,
      submissionId: "submission-1",
      revision: 2,
    });

    expect(jobs).toEqual([{
      jobId: "job-1",
      claimToken: "claim-1",
      submissionId: "submission-1",
      revision: 2,
      mediaId: "media-1",
      mediaKey: "video:0",
      inputFingerprint: "fingerprint-1",
      ordinal: 3,
      mediaKind: "video",
      sourceUrl: "https://scontent.cdninstagram.com/v/video/one.mp4",
      attemptCount: 2,
      maxAttempts: 3,
    }]);
  });

  it("fails loudly when the claim RPC returns a malformed leased row", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ job_id: "leased-but-malformed" }],
      error: null,
    }));

    await expect(claimSocialMediaJobs({
      supabase: { rpc } as never,
      submissionId: "submission-1",
      revision: 2,
    })).rejects.toThrow("invalid row contract");
  });

  it("returns the database settlement state for accurate worker reporting", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ job_state: "dead_letter" }],
      error: null,
    }));

    await expect(failSocialMediaJob({
      supabase: { rpc } as never,
      job: {
        jobId: "job-1",
        claimToken: "claim-1",
        submissionId: "submission-1",
        revision: 2,
        mediaId: "media-1",
        mediaKey: "image:0",
        inputFingerprint: "fingerprint-1",
        ordinal: 0,
        mediaKind: "image",
        sourceUrl: "https://scontent.cdninstagram.com/v/image/one.jpg",
        attemptCount: 5,
        maxAttempts: 5,
      },
      error: new Error("unsupported image"),
    })).resolves.toBe("dead_letter");
    expect(rpc).toHaveBeenCalledWith("fail_social_spot_media_job_v1", expect.objectContaining({
      p_retryable: false,
    }));
  });

  it("prioritizes runnable submissions before terminal dead letters", async () => {
    const recoveryQuery = {
      eq: vi.fn(() => recoveryQuery),
      lt: vi.fn(async () => ({ error: null })),
    };
    const inIds = vi.fn();
    const runnableQuery = {
      in: inIds,
    };
    inIds.mockResolvedValue({
        data: [{
          id: "submission-ready",
          canonical_url: "https://www.instagram.com/p/READY123",
          platform: "instagram",
          media_processing_revision: 1,
          media_processing_state: "queued",
          metadata: { finalUrl: "https://www.instagram.com/p/READY123" },
          research: {},
          notes: null,
          city_hint: null,
        }],
        error: null,
    });
    const rpc = vi.fn(async () => ({
      data: [{ submission_id: "submission-ready" }],
      error: null,
    }));
    const from = vi.fn()
      .mockReturnValueOnce({
        update: vi.fn(() => recoveryQuery),
      })
      .mockReturnValueOnce({
        update: vi.fn(() => recoveryQuery),
      })
      .mockReturnValueOnce({
        select: vi.fn(() => runnableQuery),
      });

    const work = await listSocialMediaWork({
      supabase: { from, rpc } as never,
      limit: 1,
    });

    expect(rpc).toHaveBeenCalledWith("list_ready_social_spot_media_work_v1", {
      p_limit: 1,
    });
    expect(inIds).toHaveBeenCalledWith("id", ["submission-ready"]);
    expect(work).toEqual([expect.objectContaining({
      id: "submission-ready",
      state: "queued",
    })]);
  });

  it("fences aggregate finalization with a unique ownership token", async () => {
    const claimedToken = "99999999-9999-4999-8999-999999999999";
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: claimedToken, error: null })
      .mockResolvedValueOnce({ data: "completed", error: null });
    const supabase = { rpc } as never;

    const token = await claimReadySocialMediaFinalization({
      supabase,
      submissionId: "submission-1",
      revision: 2,
    });
    expect(token).toBe(claimedToken);
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_social_spot_media_finalization_v2", {
      p_submission_id: "submission-1",
      p_revision: 2,
      p_lease_seconds: 180,
    });

    await settleSocialMediaFinalization({
      supabase,
      submissionId: "submission-1",
      revision: 2,
      finalizationToken: token as string,
      succeeded: true,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "settle_social_spot_media_finalization_v2", {
      p_submission_id: "submission-1",
      p_revision: 2,
      p_finalization_token: claimedToken,
      p_succeeded: true,
    });
  });

  it("fences provider coverage retries with an expiring ownership token", async () => {
    const claimedToken = "99999999-9999-4999-8999-999999999999";
    const rpc = vi.fn(async () => ({ data: claimedToken, error: null }));
    const supabase = { rpc } as never;

    const token = await claimSocialMediaCoverageRetry({
      supabase,
      submissionId: "submission-1",
    });

    expect(token).toBe(claimedToken);
    expect(rpc).toHaveBeenCalledWith("claim_social_spot_media_coverage_v1", {
      p_submission_id: "submission-1",
      p_lease_seconds: 60,
    });
  });

  it("schedules bounded legacy work without enabling Instagram prematurely", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ submission_id: "11111111-1111-4111-8111-111111111111" }],
      error: null,
    }));

    const scheduled = await scheduleLegacySocialMediaBackfill({
      supabase: { rpc } as never,
      submissionIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      cutoff: "2026-07-10T09:00:00.000Z",
      limit: 2,
      includeInstagram: false,
      includeResolved: true,
    });

    expect(scheduled).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(rpc).toHaveBeenCalledWith(
      "schedule_legacy_social_spot_media_backfill_v1",
      {
        p_submission_ids: [
          "11111111-1111-4111-8111-111111111111",
          "22222222-2222-4222-8222-222222222222",
        ],
        p_cutoff: "2026-07-10T09:00:00.000Z",
        p_limit: 2,
        p_include_instagram: false,
        p_include_resolved: true,
      },
    );
  });

  it("loads sanitized parent processing state for batched tracker polling", async () => {
    const inFilter = vi.fn(async () => ({
      data: [{
        id: "submission-1",
        media_processing_state: "coverage_retry",
        media_processing_revision: 2,
        media_item_count: 3,
        media_succeeded_count: 1,
        media_dead_letter_count: 0,
        media_extraction_attempt_count: 2,
        media_finalization_attempt_count: 1,
      }],
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ in: inFilter })),
      })),
    } as never;

    const processing = await loadSocialMediaProcessingForSubmissions({
      supabase,
      submissionIds: ["submission-1"],
    });

    expect(processing.get("submission-1")).toEqual({
      state: "coverage_retry",
      revision: 2,
      total: 3,
      succeeded: 1,
      failed: 0,
      extractionAttempts: 2,
      finalizationAttempts: 1,
    });
  });

  it("fails loudly when legacy scheduling returns a malformed row", async () => {
    const rpc = vi.fn(async () => ({ data: [{}], error: null }));

    await expect(scheduleLegacySocialMediaBackfill({
      supabase: { rpc } as never,
      submissionIds: ["11111111-1111-4111-8111-111111111111"],
      cutoff: "2026-07-10T09:00:00.000Z",
      includeInstagram: true,
      includeResolved: true,
    })).rejects.toThrow("invalid row contract");
  });

  it("classifies permanent and retryable failures without exposing internals", () => {
    expect(classifySocialMediaJobError(new Error("The social video is too large"))).toMatchObject({
      code: "MEDIA_UNSUPPORTED",
      retryable: false,
    });
    expect(classifySocialMediaJobError(new Error("Provider returned 429"))).toMatchObject({
      code: "MEDIA_RATE_LIMITED",
      retryable: true,
    });
    expect(classifySocialMediaJobError(new Error("Video upload timed out"))).toMatchObject({
      code: "MEDIA_TEMPORARILY_UNAVAILABLE",
      retryable: true,
    });
    expect(classifySocialMediaJobError(
      new Error("400 Error while downloading file. Upstream status code: 403."),
    )).toMatchObject({
      code: "MEDIA_TEMPORARILY_UNAVAILABLE",
      retryable: true,
    });
    expect(classifySocialMediaJobError(new Error("403 Forbidden"))).toMatchObject({
      code: "MEDIA_TEMPORARILY_UNAVAILABLE",
      retryable: true,
    });
    expect(classifySocialMediaJobError(new Error("invalid signed URL"))).toMatchObject({
      code: "MEDIA_TEMPORARILY_UNAVAILABLE",
      retryable: true,
    });
  });
});
