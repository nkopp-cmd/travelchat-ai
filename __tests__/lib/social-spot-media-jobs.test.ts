import { describe, expect, it, vi } from "vitest";
import {
  assessSocialMediaCoverage,
  buildSocialMediaManifest,
  claimReadySocialMediaFinalization,
  claimSocialMediaCoverageRetry,
  claimSocialMediaJobs,
  classifySocialMediaJobError,
  listSocialMediaWork,
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
    const claimPayloads: Array<Record<string, unknown>> = [];
    const claimQuery = {
      eq: vi.fn(() => claimQuery),
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { id: "submission-1" }, error: null })),
      })),
    };
    const settleFilters: Array<[string, unknown]> = [];
    const settleQuery = {
      eq: vi.fn((column: string, value: unknown) => {
        settleFilters.push([column, value]);
        return settleQuery;
      }),
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { id: "submission-1" }, error: null })),
      })),
    };
    const from = vi.fn()
      .mockReturnValueOnce({
        update: vi.fn((payload: Record<string, unknown>) => {
          claimPayloads.push(payload);
          return claimQuery;
        }),
      })
      .mockReturnValueOnce({
        update: vi.fn(() => settleQuery),
      });
    const supabase = { from } as never;

    const token = await claimReadySocialMediaFinalization({
      supabase,
      submissionId: "submission-1",
      revision: 2,
    });
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(claimPayloads[0]).toMatchObject({
      media_processing_state: "finalizing",
      media_finalization_token: token,
    });

    await settleSocialMediaFinalization({
      supabase,
      submissionId: "submission-1",
      revision: 2,
      finalizationToken: token as string,
      succeeded: true,
    });
    expect(settleFilters).toContainEqual(["media_finalization_token", token]);
  });

  it("fences provider coverage retries with an expiring ownership token", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const filters: Array<[string, unknown]> = [];
    const query = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      lte: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { id: "submission-1" }, error: null })),
      })),
    };
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          payloads.push(payload);
          return query;
        }),
      })),
    } as never;

    const token = await claimSocialMediaCoverageRetry({
      supabase,
      submissionId: "submission-1",
    });

    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(payloads[0]).toMatchObject({
      media_processing_state: "coverage_processing",
      media_extraction_token: token,
    });
    expect(filters).toContainEqual(["media_processing_state", "coverage_retry"]);
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
  });
});
