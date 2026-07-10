import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "clerk_test" })),
  createSupabaseAdmin: vi.fn(),
  rateLimitStrict: vi.fn(async () => null),
  revalidateTag: vi.fn(),
  geocodeWithCascade: vi.fn(async () => ({ lat: 37.5665, lng: 126.9780, provider: "nominatim" })),
  getGooglePlacesApiKey: vi.fn(() => "google_places_test"),
  findBestGooglePlaceMatch: vi.fn(async (name: string, address: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "spot";

    return {
      place: {
        placeId: `place_${slug}`,
        displayName: name,
        formattedAddress: `${address}, South Korea`,
        location: { latitude: 37.5665, longitude: 126.9780 },
        types: ["cafe"],
        photos: [{ name: `places/place_${slug}/photos/photo_1` }],
      },
      quality: { acceptable: true, reason: "accepted", nameScore: 1, addressScore: 1 },
      query: `${name}, ${address}`,
    };
  }),
  fetchSocialLinkMetadata: vi.fn(async () => ({
    title: "Hidden Seoul Cafe | TikTok",
    description: "Small cafe",
    imageUrl: "https://cdn.example.com/cafe.jpg",
    finalUrl: "https://vm.tiktok.com/ZMh123",
  })),
  enrichSocialLinkMetadataWithProvider: vi.fn(async (metadata: Record<string, unknown>) => metadata),
  syncSocialMediaManifest: vi.fn(async () => ({
    available: true,
    queued: false,
    workerRequired: false,
    coverage: { complete: false, expectedCount: 0, extractedCount: 0, reason: "no_media" },
    total: 0,
    revision: 0,
    state: "not_started",
  })),
  loadSocialMediaProgress: vi.fn(async () => []),
  researchSocialSpotLink: vi.fn(async () => ({
    status: "candidate",
    spotName: "Hidden Seoul Cafe",
    description: "A small cafe with strong local signal.",
    address: "1 Seoullo, Seoul",
    city: "Seoul",
    category: "Cafe",
    subcategories: ["Coffee"],
    localleyScore: 5,
    localPercentage: 82,
    bestTime: "Weekday afternoon",
    tips: ["Go before dinner"],
    confidence: 0.84,
    researchSummary: "Verified as a real cafe from social and web evidence.",
    evidenceUrls: ["https://vm.tiktok.com/ZMh123"],
    mediaAnalysis: {
      status: "images_extracted",
      output: "The submitted image was analyzed.",
    },
  })),
  contributorRows: [] as Array<Record<string, unknown>>,
  submissionRows: [] as Array<Record<string, unknown>>,
  spotRows: [] as Array<Record<string, unknown>>,
  spotInsertErrors: [] as Array<{ code: string; message: string }>,
  ledgerRows: [] as Array<Record<string, unknown>>,
  aliasRows: [] as Array<Record<string, unknown>>,
  candidateRows: [] as Array<Record<string, unknown>>,
  optionalSocialSchemaAvailable: true,
  resumeClaimConflict: false,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimiters: {
    strict: mocks.rateLimitStrict,
  },
}));

vi.mock("@/lib/geocoding", () => ({
  geocodeWithCascade: mocks.geocodeWithCascade,
}));

vi.mock("@/lib/place-images", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/place-images")>();
  return {
    ...actual,
    getGooglePlacesApiKey: mocks.getGooglePlacesApiKey,
    findBestGooglePlaceMatch: mocks.findBestGooglePlaceMatch,
  };
});

vi.mock("@/lib/social-spot-submissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social-spot-submissions")>();
  return {
    ...actual,
    enrichSocialLinkMetadataWithProvider: mocks.enrichSocialLinkMetadataWithProvider,
    fetchSocialLinkMetadata: mocks.fetchSocialLinkMetadata,
    researchSocialSpotLink: mocks.researchSocialSpotLink,
  };
});

vi.mock("@/lib/social-spot-media-jobs", () => ({
  syncSocialMediaManifest: mocks.syncSocialMediaManifest,
  loadSocialMediaProgress: mocks.loadSocialMediaProgress,
}));

function createSupabaseMock() {
  return {
    rpc: vi.fn(async (functionName: string, payload: Record<string, unknown>) => {
      if (!mocks.optionalSocialSchemaAvailable) {
        return {
          data: null,
          error: { code: "PGRST202", message: `Could not find the function ${functionName}` },
        };
      }

      if (functionName === "sync_social_submission_candidates_v1") {
        const candidates = payload.p_candidates as Array<Record<string, unknown>>;
        mocks.candidateRows.push(...candidates.map((candidate, ordinal) => ({
          submission_id: payload.p_submission_id,
          ordinal,
          ...candidate,
        })));
        return { data: candidates.length, error: null };
      }

      if (functionName === "award_social_submission_tokens_v1") {
        const existing = mocks.ledgerRows.find((row) =>
          row.submission_id === payload.p_submission_id && row.reason === "social_spot_submission",
        );
        const contributor = mocks.contributorRows.find((row) => row.id === payload.p_contributor_id);
        const awarded = existing ? 0 : Number(payload.p_delta || 0);
        if (!existing) {
          mocks.ledgerRows.push({
            contributor_id: payload.p_contributor_id,
            submission_id: payload.p_submission_id,
            delta: awarded,
            reason: "social_spot_submission",
            metadata: payload.p_metadata,
          });
          if (contributor) {
            contributor.total_tokens = Number(contributor.total_tokens || 0) + awarded;
          }
          const submission = mocks.submissionRows.find((row) => row.id === payload.p_submission_id);
          if (submission) submission.token_awarded = awarded;
        }
        return {
          data: [{ awarded, total_tokens: Number(contributor?.total_tokens || 0) }],
          error: null,
        };
      }

      throw new Error(`Unexpected RPC ${functionName}`);
    }),
    from: vi.fn((table: string) => {
      if (table === "spot_contributors") {
        return {
          upsert: vi.fn((payload: Record<string, unknown>) => {
            const existing = mocks.contributorRows.find((row) => row.email === payload.email);
            const row = existing || {
              id: "contributor_test",
              email: payload.email,
              public_credit_name: payload.public_credit_name,
              total_tokens: 0,
            };
            Object.assign(row, payload);
            if (!existing) mocks.contributorRows.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: row, error: null })),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            const query = {
              filters: [] as Array<[string, unknown]>,
              eq: vi.fn((column: string, value: unknown) => {
                query.filters.push([column, value]);
                return query;
              }),
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  const row = mocks.contributorRows.find((item) =>
                    query.filters.every(([column, value]) => item[column] === value),
                  );
                  if (row) Object.assign(row, payload);
                  return { data: row || null, error: null };
                }),
              })),
            };
            return query;
          }),
          select: vi.fn(() => {
            const query = {
              filters: [] as Array<[string, unknown]>,
              eq: vi.fn((column: string, value: unknown) => {
                query.filters.push([column, value]);
                return query;
              }),
              maybeSingle: vi.fn(async () => {
                const row = mocks.contributorRows.find((item) =>
                  query.filters.every(([column, value]) => item[column] === value),
                );
                return { data: row || null, error: null };
              }),
            };
            return query;
          }),
        };
      }

      if (table === "social_spot_submissions") {
        return {
          select: vi.fn(() => {
            const query = {
              eq: vi.fn((_column: string, value: string) => {
                query.filters.push([_column, value]);
                return query;
              }),
              filters: [] as Array<[string, string]>,
              maybeSingle: vi.fn(async () => {
                const row = mocks.submissionRows.find((submission) =>
                  query.filters.every(([column, value]) => {
                    if (column === "metadata->>finalUrl") {
                      return (submission.metadata as { finalUrl?: string } | undefined)?.finalUrl === value;
                    }
                    return submission[column] === value;
                  }),
                );
                return { data: row || null, error: null };
              }),
            };
            return query;
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            const schemaMissing = !mocks.optionalSocialSchemaAvailable && "processing_state" in payload;
            const row = {
              id: "submission_test",
              ...payload,
            };
            if (!schemaMissing) mocks.submissionRows.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => schemaMissing
                  ? {
                      data: null,
                      error: { code: "PGRST204", message: "processing_state was not found" },
                    }
                  : { data: row, error: null }),
              })),
            };
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            const query = {
              filters: [] as Array<[string, string]>,
              eq: vi.fn((column: string, value: string) => {
                query.filters.push([column, value]);
                return query;
              }),
              select: vi.fn(() => {
                const execute = async (allowMissing: boolean) => {
                  if (
                    !mocks.optionalSocialSchemaAvailable &&
                    ("processing_state" in payload || "completed_at" in payload)
                  ) {
                    return {
                      data: null,
                      error: { code: "PGRST204", message: "processing_state was not found" },
                    };
                  }
                  const row = mocks.submissionRows.find((submission) =>
                    query.filters.every(([column, value]) => submission[column] === value),
                  );
                  if (!row) {
                    return allowMissing
                      ? { data: null, error: null }
                      : { data: null, error: { message: "not found" } };
                  }
                  if (mocks.resumeClaimConflict && "processing_state" in payload) {
                    mocks.resumeClaimConflict = false;
                    row.updated_at = new Date().toISOString();
                    return { data: null, error: null };
                  }
                  Object.assign(row, payload);
                  row.updated_at = new Date().toISOString();
                  return { data: row, error: null };
                };
                return {
                  single: vi.fn(() => execute(false)),
                  maybeSingle: vi.fn(() => execute(true)),
                };
              }),
            };
            return query;
          }),
        };
      }

      if (table === "spots") {
        return {
          select: vi.fn(() => {
            const query = {
              filters: [] as Array<[string, string]>,
              ilike: vi.fn((column: string, value: string) => {
                query.filters.push([column, value]);
                return query;
              }),
              eq: vi.fn((column: string, value: string) => {
                query.filters.push([column, value]);
                return query;
              }),
              limit: vi.fn(async () => {
                const rows = mocks.spotRows.filter((spot) =>
                  query.filters.every(([column, value]) => {
                    const normalizedValue = value.replace(/%/g, "").toLowerCase();
                    if (column === "name->>en") {
                      return String((spot.name as { en?: string })?.en || "").toLowerCase() === normalizedValue;
                    }
                    if (column === "address->>en") {
                      return String((spot.address as { en?: string })?.en || "").toLowerCase().includes(normalizedValue);
                    }
                    if (column === "google_place_id") {
                      return spot.google_place_id === value;
                    }
                    return false;
                  }),
                );

                return { data: rows, error: null };
              }),
            };
            return query;
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            const row = { id: `spot_test_${mocks.spotRows.length + 1}`, ...payload };
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const error = mocks.spotInsertErrors.shift() || null;
                  if (error) return { data: null, error };
                  mocks.spotRows.push(row);
                  return { data: row, error: null };
                }),
              })),
            };
          }),
        };
      }

      if (table === "contribution_token_ledger") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            mocks.ledgerRows.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === "social_spot_submission_aliases") {
        return {
          select: vi.fn(() => {
            const query = {
              urls: [] as string[],
              in: vi.fn((_column: string, values: string[]) => {
                query.urls = values;
                return query;
              }),
              limit: vi.fn(() => query),
              maybeSingle: vi.fn(async () => {
                if (!mocks.optionalSocialSchemaAvailable) {
                  return {
                    data: null,
                    error: { code: "PGRST205", message: "table was not found in the schema cache" },
                  };
                }
                const row = mocks.aliasRows.find((alias) =>
                  query.urls.includes(String(alias.alias_url)),
                );
                return { data: row || null, error: null };
              }),
            };
            return query;
          }),
          upsert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
            if (!mocks.optionalSocialSchemaAvailable) {
              return {
                error: { code: "PGRST205", message: "table was not found in the schema cache" },
              };
            }
            for (const row of rows) {
              if (!mocks.aliasRows.some((alias) => alias.alias_url === row.alias_url)) {
                mocks.aliasRows.push(row);
              }
            }
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("https://www.localley.io/api/spots/social-submissions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
}

function createPatchRequest(body: Record<string, unknown>, authorization?: string) {
  return new NextRequest("https://www.localley.io/api/spots/social-submissions", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
  });
}

describe("/api/spots/social-submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED = "true";
    mocks.contributorRows.length = 0;
    mocks.submissionRows.length = 0;
    mocks.spotRows.length = 0;
    mocks.spotInsertErrors.length = 0;
    mocks.ledgerRows.length = 0;
    mocks.aliasRows.length = 0;
    mocks.candidateRows.length = 0;
    mocks.optionalSocialSchemaAvailable = true;
    mocks.resumeClaimConflict = false;
    mocks.createSupabaseAdmin.mockReturnValue(createSupabaseMock());
    mocks.rateLimitStrict.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({ userId: "clerk_test" });
    mocks.enrichSocialLinkMetadataWithProvider.mockImplementation(async (metadata) => metadata);
    mocks.syncSocialMediaManifest.mockResolvedValue({
      available: true,
      queued: false,
      workerRequired: false,
      coverage: { complete: false, expectedCount: 0, extractedCount: 0, reason: "no_media" },
      total: 0,
      revision: 0,
      state: "not_started",
    });
    mocks.loadSocialMediaProgress.mockResolvedValue([]);
  });

  it("stays disabled until the feature flag is enabled", async () => {
    process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED = "false";
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/reel/ABC123",
      email: "spotter@example.com",
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("social_submissions_disabled");
    expect(mocks.rateLimitStrict).not.toHaveBeenCalled();
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects unsupported social URLs", async () => {
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://instagram.com.evil.test/reel/ABC",
      email: "spotter@example.com",
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("requires sign-in before accepting a community submission", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/reel/ABC123",
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("creates a researched spot, attribution, and token ledger entry", async () => {
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vm.tiktok.com/ZMh123?utm_source=copy",
      email: "Spotter@Example.com",
      contributorName: "Spotter",
      cityHint: "Seoul",
      notes: "Looks like a tiny cafe.",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      duplicate: false,
      submission: {
        id: "submission_test",
        status: "spot_created",
        spotId: "spot_test_1",
      },
      contributor: {
        creditName: "Spotter",
        tokensAwarded: 25,
        totalTokens: 25,
      },
      spotUrl: "/spots/spot_test_1",
    });
    expect(mocks.spotRows[0]).toMatchObject({
      name: { en: "Hidden Seoul Cafe" },
      address: { en: "1 Seoullo, Seoul, South Korea" },
      location: "POINT(126.9780000 37.5665000)",
      localley_score: 5,
      photos: [expect.stringMatching(/^\/api\/places\/photo\?/)],
    });
    expect(mocks.submissionRows[0]).toMatchObject({
      canonical_url: "https://vm.tiktok.com/ZMh123",
      platform: "tiktok",
      contributor_credit: "Spotter",
      token_awarded: 25,
    });
    expect(mocks.ledgerRows).toHaveLength(1);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("spots", "default");
  });

  it("keeps a partially analyzed multi-video submission in review", async () => {
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "candidate",
      spotName: "Hidden Seoul Cafe",
      description: "A small cafe with strong local signal.",
      address: "1 Seoullo, Seoul",
      city: "Seoul",
      category: "Cafe",
      subcategories: ["Coffee"],
      localleyScore: 5,
      localPercentage: 82,
      bestTime: "Weekday afternoon",
      tips: ["Go before dinner"],
      confidence: 0.84,
      researchSummary: "One of two videos was analyzed.",
      evidenceUrls: ["https://www.instagram.com/p/MIXED123"],
      mediaAnalysis: {
        status: "video_partially_analyzed",
        output: "Partial video evidence",
        analyzedVideoCount: 1,
        totalVideoCount: 2,
      },
    });
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce({
      title: "Mixed carousel",
      description: "Two videos",
      imageUrl: "https://scontent.cdninstagram.com/cover.jpg",
      videoUrl: "https://scontent.cdninstagram.com/one.mp4",
      videoUrls: [
        "https://scontent.cdninstagram.com/one.mp4",
        "https://scontent.cdninstagram.com/two.mp4",
      ],
      mediaCompleteness: "complete",
      finalUrl: "https://www.instagram.com/p/MIXED123",
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/p/MIXED123",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission.status).toBe("needs_review");
    expect(body.spots).toHaveLength(0);
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.submissionRows[0]).toMatchObject({ status: "needs_review" });
  });

  it("keeps an unavailable source video in review", async () => {
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "candidate",
      spotName: "Hidden Seoul Cafe",
      description: "A small cafe with strong local signal.",
      address: "1 Seoullo, Seoul",
      city: "Seoul",
      category: "Cafe",
      subcategories: ["Coffee"],
      localleyScore: 5,
      localPercentage: 82,
      bestTime: "Weekday afternoon",
      tips: [],
      confidence: 0.84,
      researchSummary: "The caption is useful, but the source video was unavailable.",
      evidenceUrls: ["https://www.instagram.com/reel/UNAVAILABLE123"],
      mediaAnalysis: {
        status: "video_unavailable",
        output: null,
        analyzedVideoCount: 0,
        totalVideoCount: 1,
      },
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/reel/UNAVAILABLE123",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission.status).toBe("needs_review");
    expect(body.spots).toHaveLength(0);
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.submissionRows[0]).toMatchObject({ status: "needs_review" });
  });

  it("keeps provider-unavailable Instagram media in review", async () => {
    mocks.syncSocialMediaManifest.mockResolvedValueOnce({
      available: true,
      queued: false,
      workerRequired: true,
      coverage: {
        complete: false,
        expectedCount: 3,
        extractedCount: 1,
        reason: "provider_partial",
      },
      total: 1,
      revision: 0,
      state: "coverage_retry",
    });
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "candidate",
      spotName: "Caption Cafe",
      description: "A cafe named in the post caption.",
      address: "1 Seoullo, Seoul",
      city: "Seoul",
      category: "Cafe",
      subcategories: [],
      localleyScore: 4,
      localPercentage: 75,
      bestTime: "Afternoon",
      tips: [],
      confidence: 0.82,
      researchSummary: "The provider media could not be fully verified.",
      evidenceUrls: ["https://www.instagram.com/p/PARTIALMEDIA123"],
      mediaAnalysis: {
        status: "media_partially_extracted",
        output: null,
        analyzedVideoCount: 0,
        totalVideoCount: 0,
      },
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/p/PARTIALMEDIA123",
    }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.submission.status).toBe("needs_review");
    expect(body.mediaProcessing).toMatchObject({
      state: "coverage_retry",
      total: 1,
      expected: 3,
      coverage: "provider_partial",
    });
    expect(body.spots).toHaveLength(0);
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.submissionRows[0]).toMatchObject({ status: "needs_review" });
  });

  it("checkpoints a submission before invoking paid provider enrichment", async () => {
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce({
      title: "Instagram",
      description: null,
      imageUrl: null,
      finalUrl: "https://www.instagram.com/p/CHECKPOINT123",
    });
    mocks.enrichSocialLinkMetadataWithProvider.mockImplementationOnce(async (metadata) => {
      expect(mocks.submissionRows).toHaveLength(1);
      expect(mocks.submissionRows[0]).toMatchObject({
        canonical_url: "https://www.instagram.com/p/CHECKPOINT123",
        status: "research_pending",
      });
      return metadata;
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/p/CHECKPOINT123",
    }));

    expect(response.status).toBe(200);
    expect(mocks.fetchSocialLinkMetadata).toHaveBeenCalledWith(
      "https://www.instagram.com/p/CHECKPOINT123",
      expect.objectContaining({ includeInstagramProvider: false }),
    );
    expect(mocks.enrichSocialLinkMetadataWithProvider).toHaveBeenCalledOnce();
  });

  it("returns accepted and defers public spot creation while media jobs are queued", async () => {
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce({
      title: "Two Seoul places",
      description: "A mixed carousel",
      imageUrl: "https://scontent.cdninstagram.com/v/image/cover.jpg",
      mediaUrls: ["https://scontent.cdninstagram.com/v/image/cover.jpg"],
      videoUrls: ["https://scontent.cdninstagram.com/v/video/one.mp4"],
      finalUrl: "https://www.instagram.com/p/QUEUED123",
    });
    mocks.syncSocialMediaManifest.mockResolvedValueOnce({
      available: true,
      queued: true,
      workerRequired: true,
      coverage: { complete: true, expectedCount: 2, extractedCount: 2, reason: "complete" },
      total: 2,
      revision: 1,
      state: "queued",
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/p/QUEUED123",
    }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      submission: { status: "needs_review", spotId: null },
      mediaProcessing: {
        state: "queued",
        total: 2,
        trackerUrl: "/spots/submissions",
      },
      spots: [],
    });
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
  });

  it("stays compatible while the optional reliability migration is pending", async () => {
    mocks.optionalSocialSchemaAvailable = false;
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vm.tiktok.com/ZMh123?utm_source=copy",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      id: "submission_test",
      status: "spot_created",
      spotId: "spot_test_1",
    });
    expect(body.contributor).toMatchObject({ tokensAwarded: 25, totalTokens: 25 });
    expect(mocks.submissionRows).toHaveLength(1);
    expect(mocks.submissionRows[0]).not.toHaveProperty("processing_state");
    expect(mocks.submissionRows[0]).toMatchObject({ token_awarded: 25 });
    expect(mocks.ledgerRows).toHaveLength(1);
    expect(mocks.aliasRows).toHaveLength(0);
    expect(mocks.candidateRows).toHaveLength(0);
  });

  it("creates the spot without a place ID when the production column is not migrated yet", async () => {
    mocks.spotInsertErrors.push({
      code: "42703",
      message: "column spots.google_place_id does not exist",
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vm.tiktok.com/ZMh123?utm_source=copy",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      status: "spot_created",
      spotId: "spot_test_1",
    });
    expect(mocks.spotRows).toHaveLength(1);
    expect(mocks.spotRows[0]).not.toHaveProperty("google_place_id");
  });

  it("accepts a URL-only submission with anonymous attribution", async () => {
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vm.tiktok.com/ZMh123?utm_source=copy",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      duplicate: false,
      contributor: {
        creditName: "Localley contributor",
        tokensAwarded: 25,
        totalTokens: 25,
      },
    });
    expect(mocks.contributorRows[0]).toMatchObject({
      email: expect.stringMatching(/^anonymous-[0-9a-f]+@contributor\.localley\.io$/),
      public_credit_name: "Localley contributor",
    });
    expect(mocks.submissionRows[0]).toMatchObject({
      canonical_url: "https://vm.tiktok.com/ZMh123",
      contributor_credit: "Localley contributor",
      token_awarded: 25,
    });
  });

  it("creates a spot from an Instagram image post", async () => {
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce({
      title: "Tiny Noodle Bar on Instagram",
      description: "A photo post from a local creator.",
      imageUrl: "https://cdn.example.com/noodle-post.jpg",
      thumbnailUrl: "https://cdn.example.com/noodle-post.jpg",
      sourceType: "instagram_post",
      sourceLabel: "Instagram post",
      finalUrl: "https://www.instagram.com/p/IMG123",
    });
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "candidate",
      spotName: "Tiny Noodle Bar",
      description: "A compact noodle shop identified from an Instagram image post.",
      address: "7 Eulji-ro, Seoul",
      city: "Seoul",
      category: "Restaurant",
      subcategories: ["Noodles"],
      localleyScore: 5,
      localPercentage: 80,
      bestTime: "Late lunch",
      tips: ["Check the daily broth"],
      confidence: 0.82,
      researchSummary: "Verified from the Instagram post metadata and web evidence.",
      evidenceUrls: ["https://www.instagram.com/p/IMG123"],
      imageUrl: null,
      visualEvidence: "Instagram post image shows the storefront signage.",
      candidates: [],
      mediaAnalysis: {
        status: "images_extracted",
        output: "The submitted image was analyzed.",
      },
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/p/IMG123/?igsh=abc",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      status: "spot_created",
      spotId: "spot_test_1",
    });
    expect(mocks.submissionRows[0]).toMatchObject({
      canonical_url: "https://www.instagram.com/p/IMG123",
      platform: "instagram",
      metadata: expect.objectContaining({
        sourceType: "instagram_post",
        sourceLabel: "Instagram post",
      }),
    });
    expect(mocks.spotRows[0]).toMatchObject({
      name: { en: "Tiny Noodle Bar" },
      photos: [expect.stringMatching(/^\/api\/places\/photo\?/)],
      google_place_id: "place_tiny_noodle_bar",
    });
  });

  it("keeps verified research in review when real place photos cannot be resolved", async () => {
    mocks.findBestGooglePlaceMatch.mockResolvedValueOnce({
      place: null,
      quality: null,
      query: null,
      rejectedPlace: null,
      rejectedQuality: null,
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vm.tiktok.com/ZMh123?utm_source=copy",
      email: "spotter@example.com",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      status: "needs_review",
      spotId: null,
    });
    expect(body.spotUrl).toBeNull();
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.submissionRows[0].research).toMatchObject({
      createdCandidates: [
        expect.objectContaining({
          spotId: null,
          status: "needs_review",
          enrichmentStatus: "place_photo_missing",
        }),
      ],
    });
  });

  it("does not accept unrelated Korean place names as an exact fallback match", async () => {
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "candidate",
      spotName: "카페 온화",
      description: "A cafe identified from the social post.",
      address: "서울특별시 마포구 월드컵북로 12",
      city: "서울",
      category: "Cafe",
      subcategories: ["Coffee"],
      localleyScore: 4,
      localPercentage: 74,
      bestTime: "Weekday afternoon",
      tips: ["Check opening hours"],
      confidence: 0.88,
      researchSummary: "The post appears to identify 카페 온화.",
      evidenceUrls: ["https://vm.tiktok.com/ZMh123"],
      imageUrl: null,
      visualEvidence: "The caption names the cafe.",
      candidates: [],
      mediaAnalysis: {
        status: "images_extracted",
        output: "The submitted image was analyzed.",
      },
    });
    mocks.findBestGooglePlaceMatch.mockResolvedValueOnce({
      place: null,
      quality: null,
      query: null,
      rejectedPlace: {
        placeId: "place_unrelated_restaurant",
        displayName: "다른 식당",
        formattedAddress: "서울특별시 마포구 월드컵북로 99",
        location: { latitude: 37.5665, longitude: 126.9780 },
        types: ["restaurant"],
        photos: [{ name: "places/place_unrelated_restaurant/photos/photo_1" }],
      },
      rejectedQuality: {
        acceptable: false,
        reason: "partial_name_without_strong_address_match",
        nameScore: 0,
        addressScore: 0.4,
      },
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vm.tiktok.com/ZMh123?utm_source=copy",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      status: "needs_review",
      spotId: null,
    });
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.submissionRows[0].research).toMatchObject({
      createdCandidates: [
        expect.objectContaining({
          spotId: null,
          status: "needs_review",
          enrichmentStatus: "place_photo_missing",
        }),
      ],
    });
  });

  it("creates multiple localized spots from one social post when research finds several candidates", async () => {
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "candidate",
      spotName: "Hidden Seoul Cafe",
      description: "A small cafe with strong local signal.",
      address: "1 Seoullo, Seoul",
      city: "Seoul",
      category: "Cafe",
      subcategories: ["Coffee"],
      localleyScore: 5,
      localPercentage: 82,
      bestTime: "Weekday afternoon",
      tips: ["Go before dinner"],
      confidence: 0.84,
      researchSummary: "Verified two distinct places from the post and web evidence.",
      evidenceUrls: ["https://vm.tiktok.com/ZMh123"],
      imageUrl: "https://cdn.example.com/cafe-frame.jpg",
      visualEvidence: "Cover image shows the cafe frontage.",
      candidates: [
        {
          status: "candidate",
          spotName: "Hidden Seoul Cafe",
          description: "A small cafe with strong local signal.",
          address: "1 Seoullo, Seoul",
          city: "Seoul",
          category: "Cafe",
          subcategories: ["Coffee"],
          localleyScore: 5,
          localPercentage: 82,
          bestTime: "Weekday afternoon",
          tips: ["Go before dinner"],
          confidence: 0.84,
          researchSummary: "Verified as a real cafe.",
          evidenceUrls: ["https://vm.tiktok.com/ZMh123"],
          imageUrl: "https://cdn.example.com/cafe-frame.jpg",
          visualEvidence: "Cover image shows the cafe frontage.",
        },
        {
          status: "candidate",
          spotName: "Ikseon Alley Dessert",
          description: "A dessert shop shown later in the same social post.",
          address: "22 Supyo-ro 28-gil, Seoul",
          city: "Seoul",
          category: "Dessert",
          subcategories: ["Dessert"],
          localleyScore: 4,
          localPercentage: 76,
          bestTime: "After lunch",
          tips: ["Expect a short wait"],
          confidence: 0.79,
          researchSummary: "Verified as a separate dessert shop.",
          evidenceUrls: ["https://vm.tiktok.com/ZMh123"],
          imageUrl: "https://cdn.example.com/dessert-frame.jpg",
          visualEvidence: "Cover metadata and caption mention a second dessert stop.",
        },
      ],
      mediaAnalysis: {
        status: "video_analyzed",
        output: "The submitted video was analyzed completely.",
        analyzedVideoCount: 1,
        totalVideoCount: 1,
      },
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vm.tiktok.com/ZMh123?utm_source=copy",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      status: "spot_created",
      spotId: "spot_test_1",
    });
    expect(body.spots).toEqual([
      expect.objectContaining({
        spotId: "spot_test_1",
        name: "Hidden Seoul Cafe",
        status: "spot_created",
      }),
      expect.objectContaining({
        spotId: "spot_test_2",
        name: "Ikseon Alley Dessert",
        status: "spot_created",
      }),
    ]);
    expect(mocks.spotRows).toHaveLength(2);
    expect(mocks.spotRows[0]).toMatchObject({
      photos: [expect.stringMatching(/^\/api\/places\/photo\?/)],
      google_place_id: "place_hidden_seoul_cafe",
    });
    expect(mocks.spotRows[1]).toMatchObject({
      photos: [expect.stringMatching(/^\/api\/places\/photo\?/)],
      google_place_id: "place_ikseon_alley_dessert",
    });
    expect(mocks.submissionRows[0].research).toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({ spotName: "Hidden Seoul Cafe" }),
        expect.objectContaining({ spotName: "Ikseon Alley Dessert" }),
      ]),
      createdCandidates: expect.arrayContaining([
        expect.objectContaining({ spotId: "spot_test_1" }),
        expect.objectContaining({ spotId: "spot_test_2" }),
      ]),
    });
  });

  it("reuses an existing Google place across different research names and addresses", async () => {
    const existingSpot = {
      id: "spot_existing_google_place",
      name: { en: "Hidden Cafe Seoul" },
      address: { en: "1 Seoul-ro, Jung-gu, Seoul, South Korea" },
      google_place_id: "place_hidden_seoul_cafe",
    };
    mocks.spotRows.push(existingSpot);
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vm.tiktok.com/ZMh123?utm_source=copy",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      status: "spot_reused",
      spotId: "spot_existing_google_place",
    });
    expect(body.spots).toEqual([
      expect.objectContaining({
        spotId: "spot_existing_google_place",
        status: "spot_reused",
        name: "Hidden Seoul Cafe",
      }),
    ]);
    expect(mocks.spotRows).toEqual([existingSpot]);
    expect(mocks.submissionRows[0].research).toMatchObject({
      createdCandidates: [
        expect.objectContaining({
          spotId: "spot_existing_google_place",
          status: "spot_reused",
          placeId: "place_hidden_seoul_cafe",
          placeMatchQuery: "Hidden Seoul Cafe, 1 Seoullo, Seoul",
          usedTransliteratedNameFallback: false,
        }),
      ],
    });
  });

  it("is idempotent for the same contributor and canonical URL", async () => {
    mocks.contributorRows.push({
      id: "contributor_test",
      email: "spotter@example.com",
      public_credit_name: "sp...@example.com",
      total_tokens: 25,
    });
    mocks.submissionRows.push({
      id: "submission_existing",
      contributor_id: "contributor_test",
      canonical_url: "https://www.instagram.com/reel/ABC123",
      status: "spot_created",
      spot_id: "spot_existing",
      token_awarded: 25,
      research_confidence: 0.8,
      research_summary: "Already researched.",
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/reel/ABC123/?utm_medium=copy",
      email: "spotter@example.com",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      duplicate: true,
      submission: {
        id: "submission_existing",
        status: "spot_created",
        spotId: "spot_existing",
      },
      contributor: {
        tokensAwarded: 0,
        totalTokens: 25,
      },
      spotUrl: "/spots/spot_existing",
      spots: [
        expect.objectContaining({
          spotId: "spot_existing",
          spotUrl: "/spots/spot_existing",
        }),
      ],
    });
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.ledgerRows).toHaveLength(0);
  });

  it("resumes a stale processing checkpoint for the original contributor", async () => {
    mocks.contributorRows.push({
      id: "contributor_test",
      email: "spotter@example.com",
      public_credit_name: "sp...@example.com",
      total_tokens: 0,
    });
    mocks.submissionRows.push({
      id: "submission_stale",
      contributor_id: "contributor_test",
      clerk_user_id: "clerk_test",
      canonical_url: "https://www.instagram.com/reel/ABC123",
      status: "research_pending",
      spot_id: null,
      token_awarded: 0,
      updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      research_confidence: 0,
      research_summary: "Processing interrupted.",
      research: { processing: { state: "processing" }, createdCandidates: [] },
    });
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce({
      title: "Hidden Seoul Cafe",
      description: "Small cafe",
      imageUrl: "https://cdn.example.com/cafe.jpg",
      finalUrl: "https://www.instagram.com/reel/ABC123",
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/reel/ABC123",
      email: "spotter@example.com",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      duplicate: false,
      submission: {
        id: "submission_stale",
        status: "spot_created",
        spotId: "spot_test_1",
      },
    });
    expect(mocks.submissionRows).toHaveLength(1);
    expect(mocks.ledgerRows).toHaveLength(1);
  });

  it("lets only one concurrent request claim a stale processing checkpoint", async () => {
    mocks.resumeClaimConflict = true;
    mocks.contributorRows.push({
      id: "contributor_test",
      email: "spotter@example.com",
      public_credit_name: "sp...@example.com",
      total_tokens: 0,
    });
    mocks.submissionRows.push({
      id: "submission_stale",
      contributor_id: "contributor_test",
      clerk_user_id: "clerk_test",
      canonical_url: "https://www.instagram.com/reel/ABC123",
      status: "research_pending",
      spot_id: null,
      token_awarded: 0,
      updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      research_confidence: 0,
      research_summary: "Processing interrupted.",
      research: { processing: { state: "processing", attempt: 1 }, createdCandidates: [] },
    });
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce({
      title: "Hidden Seoul Cafe",
      description: "Small cafe",
      imageUrl: "https://cdn.example.com/cafe.jpg",
      finalUrl: "https://www.instagram.com/reel/ABC123",
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/reel/ABC123",
      email: "spotter@example.com",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      duplicate: true,
      submission: { id: "submission_stale", status: "research_pending" },
    });
    expect(mocks.enrichSocialLinkMetadataWithProvider).not.toHaveBeenCalled();
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.ledgerRows).toHaveLength(0);
  });

  it("does not award tokens when another contributor submits an existing canonical URL", async () => {
    mocks.contributorRows.push({
      id: "contributor_original",
      email: "original@example.com",
      public_credit_name: "Original",
      total_tokens: 25,
    });
    mocks.submissionRows.push({
      id: "submission_existing",
      contributor_id: "contributor_original",
      canonical_url: "https://www.instagram.com/reel/ABC123",
      status: "spot_created",
      spot_id: "spot_existing",
      token_awarded: 25,
      research_confidence: 0.8,
      research_summary: "Already researched.",
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/reel/ABC123/?utm_source=copy",
      email: "new-spotter@example.com",
      contributorName: "New Spotter",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      duplicate: true,
      submission: {
        id: "submission_existing",
        status: "spot_created",
        spotId: "spot_existing",
      },
      contributor: {
        creditName: "New Spotter",
        tokensAwarded: 0,
        totalTokens: 0,
      },
      spotUrl: "/spots/spot_existing",
    });
    expect(mocks.submissionRows).toHaveLength(1);
    expect(mocks.ledgerRows).toHaveLength(0);
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
  });

  it("deduplicates a full TikTok URL against an earlier short-link submission", async () => {
    const finalUrl = "https://www.tiktok.com/@creator/video/7657943860898778388";
    mocks.submissionRows.push({
      id: "submission_short_link",
      canonical_url: "https://vt.tiktok.com/ZSCCVR3mg",
      status: "spot_created",
      spot_id: "spot_existing",
      token_awarded: 25,
      research_confidence: 0.88,
      research_summary: "Already researched from the short link.",
      metadata: { finalUrl },
      research: {
        candidates: [],
        createdCandidates: [
          {
            spotId: "spot_existing",
            status: "spot_created",
            spotName: "Existing Place",
            address: "1 Seoul-ro, Seoul",
            city: "Seoul",
            confidence: 0.88,
          },
        ],
      },
    });
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce({
      title: "Existing Place",
      description: "Same post, expanded URL.",
      imageUrl: "https://cdn.example.com/place.jpg",
      finalUrl,
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({ url: finalUrl }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      duplicate: true,
      submission: { id: "submission_short_link", spotId: "spot_existing" },
      spots: [expect.objectContaining({ spotId: "spot_existing" })],
    });
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
    expect(mocks.spotRows).toHaveLength(0);
  });

  it("stores low-confidence research without creating a spot", async () => {
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "needs_review",
      spotName: "Maybe Cafe",
      description: null,
      address: null,
      city: "Seoul",
      category: null,
      subcategories: [],
      localleyScore: null,
      localPercentage: null,
      bestTime: null,
      tips: [],
      confidence: 0.31,
      researchSummary: "Could not verify the exact place.",
      evidenceUrls: ["https://www.instagram.com/reel/ABC123"],
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://www.instagram.com/reel/ABC123",
      email: "spotter@example.com",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({
      status: "needs_review",
      spotId: null,
    });
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.ledgerRows).toHaveLength(1);
  });

  it("reruns research with added evidence and creates a spot without awarding more tokens", async () => {
    mocks.submissionRows.push({
      id: "11111111-1111-4111-8111-111111111111",
      canonical_url: "https://www.instagram.com/p/IMG123",
      platform: "instagram",
      status: "research_pending",
      spot_id: null,
      clerk_user_id: "clerk_test",
      notes: null,
      city_hint: null,
      metadata: {
        title: "Instagram post",
        imageUrl: "https://cdn.example.com/post.jpg",
        finalUrl: "https://www.instagram.com/p/IMG123",
      },
      research_confidence: 0.12,
      research_summary: "Could not verify the post.",
    });
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "candidate",
      spotName: "Cafe Saeraul",
      description: "A peaceful cafe verified after the contributor added the place name.",
      address: "10 Saeraul-ro, Seoul",
      city: "Seoul",
      category: "Cafe",
      subcategories: ["Coffee"],
      localleyScore: 4,
      localPercentage: 78,
      bestTime: "Weekday morning",
      tips: ["Check opening hours"],
      confidence: 0.81,
      researchSummary: "Verified using the added place hint and web evidence.",
      evidenceUrls: ["https://www.instagram.com/p/IMG123"],
      imageUrl: null,
      visualEvidence: "Contributor identified the place.",
      candidates: [],
      mediaAnalysis: {
        status: "images_extracted",
        output: "The submitted image was analyzed.",
      },
    });
    const { PATCH } = await import("@/app/api/spots/social-submissions/route");

    const response = await PATCH(createPatchRequest({
      submissionId: "11111111-1111-4111-8111-111111111111",
      canonicalUrl: "https://www.instagram.com/p/IMG123",
      placeHint: "Cafe Saeraul",
      cityHint: "Seoul",
      notes: "Caption shows Cafe Saeraul and a courtyard.",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      submission: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "spot_created",
        spotId: "spot_test_1",
      },
      spotUrl: "/spots/spot_test_1",
    });
    expect(mocks.spotRows[0]).toMatchObject({
      name: { en: "Cafe Saeraul" },
      photos: [expect.stringMatching(/^\/api\/places\/photo\?/)],
    });
    expect(mocks.submissionRows[0]).toMatchObject({
      status: "spot_created",
      spot_id: "spot_test_1",
      city_hint: "Seoul",
      notes: expect.stringContaining("Place hint: Cafe Saeraul"),
      research_summary: "Verified using the added place hint and web evidence.",
      research: expect.objectContaining({
        contributorEvidence: expect.arrayContaining([
          expect.objectContaining({
            placeHint: "Cafe Saeraul",
            cityHint: "Seoul",
          }),
        ]),
      }),
    });
    expect(mocks.ledgerRows).toHaveLength(0);
  });

  it("preserves previously created spots when re-research resolves another candidate", async () => {
    mocks.submissionRows.push({
      id: "33333333-3333-4333-8333-333333333333",
      canonical_url: "https://www.instagram.com/p/MULTI123",
      platform: "instagram",
      status: "spot_created",
      spot_id: "spot_existing_primary",
      clerk_user_id: "clerk_test",
      notes: null,
      city_hint: "Seoul",
      metadata: {
        title: "Two Seoul cafes",
        imageUrl: "https://cdn.example.com/post.jpg",
        finalUrl: "https://www.instagram.com/p/MULTI123",
      },
      research: {
        candidates: [],
        createdCandidates: [
          {
            spotId: "spot_existing_primary",
            status: "spot_created",
            spotName: "First Cafe",
            address: "1 First-ro, Seoul",
            city: "Seoul",
            confidence: 0.88,
            summary: "Previously verified.",
          },
          {
            spotId: null,
            status: "needs_review",
            spotName: "Second Cafe",
            address: null,
            city: "Seoul",
            confidence: 0.35,
            summary: "Needed another clue.",
          },
        ],
      },
    });
    const { PATCH } = await import("@/app/api/spots/social-submissions/route");

    const response = await PATCH(createPatchRequest({
      submissionId: "33333333-3333-4333-8333-333333333333",
      canonicalUrl: "https://www.instagram.com/p/MULTI123",
      placeHint: "Hidden Seoul Cafe",
      cityHint: "Seoul",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission.spotId).toBe("spot_existing_primary");
    expect(body.spots).toEqual(expect.arrayContaining([
      expect.objectContaining({ spotId: "spot_existing_primary" }),
      expect.objectContaining({ spotId: "spot_test_1" }),
    ]));
    expect(mocks.submissionRows[0].research).toMatchObject({
      createdCandidates: expect.arrayContaining([
        expect.objectContaining({ spotId: "spot_existing_primary" }),
        expect.objectContaining({ spotId: "spot_test_1" }),
      ]),
    });
  });

  it("finalizes complete queued media and materializes every researched place", async () => {
    process.env.CRON_SECRET = "worker-secret";
    mocks.submissionRows.push({
      id: "44444444-4444-4444-8444-444444444444",
      canonical_url: "https://www.instagram.com/p/QUEUED123",
      platform: "instagram",
      status: "needs_review",
      spot_id: null,
      clerk_user_id: "clerk_test",
      notes: null,
      city_hint: "Seoul",
      media_processing_revision: 1,
      media_processing_state: "finalizing",
      metadata: {
        finalUrl: "https://www.instagram.com/p/QUEUED123",
        mediaUrls: ["https://scontent.cdninstagram.com/v/image/one.jpg"],
        videoUrls: ["https://scontent.cdninstagram.com/v/video/two.mp4"],
      },
      research: { candidates: [], createdCandidates: [] },
    });
    mocks.loadSocialMediaProgress.mockResolvedValueOnce([
      {
        id: "image-job",
        submissionId: "44444444-4444-4444-8444-444444444444",
        revision: 1,
        ordinal: 0,
        mediaKind: "image",
        state: "succeeded",
        result: { output: "Image one shows the Hidden Seoul Cafe frontage." },
      },
      {
        id: "video-job",
        submissionId: "44444444-4444-4444-8444-444444444444",
        revision: 1,
        ordinal: 1,
        mediaKind: "video",
        state: "succeeded",
        result: { output: "Video two identifies Ikseon Alley Dessert." },
      },
    ]);
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "candidate",
      spotName: "Hidden Seoul Cafe",
      description: "A compact local cafe.",
      address: "1 Seoullo, Seoul",
      city: "Seoul",
      category: "Cafe",
      subcategories: ["Coffee"],
      localleyScore: 5,
      localPercentage: 82,
      bestTime: "Weekday afternoon",
      tips: [],
      confidence: 0.9,
      researchSummary: "Both distinct places were verified from complete media evidence.",
      evidenceUrls: ["https://www.instagram.com/p/QUEUED123"],
      candidates: [
        {
          status: "candidate",
          spotName: "Hidden Seoul Cafe",
          description: "A compact local cafe.",
          address: "1 Seoullo, Seoul",
          city: "Seoul",
          category: "Cafe",
          subcategories: ["Coffee"],
          localleyScore: 5,
          localPercentage: 82,
          bestTime: "Weekday afternoon",
          tips: [],
          confidence: 0.9,
          researchSummary: "Verified from image one.",
          evidenceUrls: ["https://www.instagram.com/p/QUEUED123"],
        },
        {
          status: "candidate",
          spotName: "Ikseon Alley Dessert",
          description: "A separate dessert stop from the same post.",
          address: "22 Supyo-ro 28-gil, Seoul",
          city: "Seoul",
          category: "Dessert",
          subcategories: ["Dessert"],
          localleyScore: 4,
          localPercentage: 76,
          bestTime: "After lunch",
          tips: [],
          confidence: 0.86,
          researchSummary: "Verified from video two.",
          evidenceUrls: ["https://www.instagram.com/p/QUEUED123"],
        },
      ],
      mediaAnalysis: {
        status: "video_analyzed",
        output: "Complete image and video evidence.",
        analyzedVideoCount: 1,
        totalVideoCount: 1,
      },
    });
    const { PATCH } = await import("@/app/api/spots/social-submissions/route");

    const response = await PATCH(createPatchRequest({
      submissionId: "44444444-4444-4444-8444-444444444444",
      canonicalUrl: "https://www.instagram.com/p/QUEUED123",
      notes: "Automatic final research after every queued media item completed.",
    }, "Bearer worker-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submission).toMatchObject({ status: "spot_created", spotId: "spot_test_1" });
    expect(body.spots).toEqual(expect.arrayContaining([
      expect.objectContaining({ spotId: "spot_test_1", name: "Hidden Seoul Cafe" }),
      expect.objectContaining({ spotId: "spot_test_2", name: "Ikseon Alley Dessert" }),
    ]));
    expect(mocks.spotRows).toHaveLength(2);
    expect(mocks.rateLimitStrict).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.researchSocialSpotLink).toHaveBeenCalledWith(expect.objectContaining({
      analyzeFirstVideo: false,
      additionalMediaAnalysis: expect.stringContaining("Hidden Seoul Cafe frontage"),
      videoAnalyses: [expect.objectContaining({ output: expect.stringContaining("Ikseon") })],
    }));
  });

  it("refuses internal finalization while any queued media item is unfinished", async () => {
    process.env.CRON_SECRET = "worker-secret";
    mocks.submissionRows.push({
      id: "55555555-5555-4555-8555-555555555555",
      canonical_url: "https://www.instagram.com/p/WAIT123",
      platform: "instagram",
      status: "needs_review",
      spot_id: null,
      clerk_user_id: "clerk_test",
      media_processing_revision: 1,
      media_processing_state: "processing",
      metadata: { finalUrl: "https://www.instagram.com/p/WAIT123" },
      research: {},
    });
    mocks.loadSocialMediaProgress.mockResolvedValueOnce([
      { id: "done", mediaKind: "image", state: "succeeded", result: { output: "done" } },
      { id: "waiting", mediaKind: "image", state: "queued", result: null },
    ]);
    const { PATCH } = await import("@/app/api/spots/social-submissions/route");

    const response = await PATCH(createPatchRequest({
      submissionId: "55555555-5555-4555-8555-555555555555",
      canonicalUrl: "https://www.instagram.com/p/WAIT123",
      notes: "Automatic final research after every queued media item completed.",
    }, "Bearer worker-secret"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.message).toContain("Every media item");
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
    expect(mocks.spotRows).toHaveLength(0);
  });

  it("keeps aggregate research retryable when the internal research provider falls back", async () => {
    process.env.CRON_SECRET = "worker-secret";
    mocks.submissionRows.push({
      id: "66666666-6666-4666-8666-666666666666",
      canonical_url: "https://www.instagram.com/p/RETRY123",
      platform: "instagram",
      status: "needs_review",
      spot_id: null,
      clerk_user_id: "clerk_test",
      media_processing_revision: 1,
      media_processing_state: "finalizing",
      metadata: {
        finalUrl: "https://www.instagram.com/p/RETRY123",
        mediaUrls: ["https://scontent.cdninstagram.com/v/image/one.jpg"],
      },
      research: {},
    });
    mocks.loadSocialMediaProgress.mockResolvedValueOnce([{
      id: "done",
      mediaKind: "image",
      state: "succeeded",
      ordinal: 0,
      result: { output: "complete image evidence" },
    }]);
    mocks.researchSocialSpotLink.mockResolvedValueOnce({
      status: "research_pending",
      spotName: null,
      description: null,
      address: null,
      city: null,
      category: null,
      subcategories: [],
      localleyScore: null,
      localPercentage: null,
      bestTime: null,
      tips: [],
      confidence: 0.1,
      researchSummary: "Aggregate research provider was temporarily unavailable.",
      evidenceUrls: ["https://www.instagram.com/p/RETRY123"],
      candidates: [],
      mediaAnalysis: {
        status: "images_extracted",
        output: "complete image evidence",
      },
    });
    const { PATCH } = await import("@/app/api/spots/social-submissions/route");

    const response = await PATCH(createPatchRequest({
      submissionId: "66666666-6666-4666-8666-666666666666",
      canonicalUrl: "https://www.instagram.com/p/RETRY123",
      notes: "Automatic final research after every queued media item completed.",
    }, "Bearer worker-secret"));

    expect(response.status).toBe(502);
    expect(mocks.spotRows).toHaveLength(0);
    expect(mocks.submissionRows[0]).toMatchObject({
      status: "needs_review",
      spot_id: null,
    });
  });

  it("rejects added evidence for submissions that already have spots", async () => {
    mocks.submissionRows.push({
      id: "22222222-2222-4222-8222-222222222222",
      canonical_url: "https://www.instagram.com/p/IMG123",
      platform: "instagram",
      status: "spot_created",
      spot_id: "spot_existing",
      clerk_user_id: "clerk_test",
      notes: null,
      city_hint: null,
      metadata: {
        finalUrl: "https://www.instagram.com/p/IMG123",
      },
    });
    const { PATCH } = await import("@/app/api/spots/social-submissions/route");

    const response = await PATCH(createPatchRequest({
      submissionId: "22222222-2222-4222-8222-222222222222",
      canonicalUrl: "https://www.instagram.com/p/IMG123",
      placeHint: "Different place",
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
    expect(mocks.spotRows).toHaveLength(0);
  });

  it("rejects evidence updates from signed-out callers", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const { PATCH } = await import("@/app/api/spots/social-submissions/route");

    const response = await PATCH(createPatchRequest({
      submissionId: "11111111-1111-4111-8111-111111111111",
      canonicalUrl: "https://www.instagram.com/p/IMG123",
      placeHint: "Cafe Saeraul",
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects evidence updates from a different signed-in user", async () => {
    mocks.submissionRows.push({
      id: "11111111-1111-4111-8111-111111111111",
      canonical_url: "https://www.instagram.com/p/IMG123",
      platform: "instagram",
      status: "research_pending",
      spot_id: null,
      clerk_user_id: "clerk_original",
      notes: null,
      city_hint: null,
      metadata: { finalUrl: "https://www.instagram.com/p/IMG123" },
      research: {},
    });
    const { PATCH } = await import("@/app/api/spots/social-submissions/route");

    const response = await PATCH(createPatchRequest({
      submissionId: "11111111-1111-4111-8111-111111111111",
      canonicalUrl: "https://www.instagram.com/p/IMG123",
      placeHint: "Cafe Saeraul",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
  });

  it("deduplicates a registered social URL alias", async () => {
    mocks.submissionRows.push({
      id: "submission_alias_target",
      canonical_url: "https://www.tiktok.com/@creator/video/123456789",
      status: "spot_created",
      spot_id: "spot_existing",
      token_awarded: 25,
      research_confidence: 0.9,
      research_summary: "Already processed.",
      research: { createdCandidates: [] },
    });
    mocks.aliasRows.push({
      alias_url: "https://vt.tiktok.com/ALIAS123",
      submission_id: "submission_alias_target",
    });
    mocks.fetchSocialLinkMetadata.mockResolvedValueOnce({
      title: "Existing place",
      description: null,
      imageUrl: null,
      finalUrl: "https://vt.tiktok.com/ALIAS123",
    });
    const { POST } = await import("@/app/api/spots/social-submissions/route");

    const response = await POST(createRequest({
      url: "https://vt.tiktok.com/ALIAS123",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      duplicate: true,
      submission: { id: "submission_alias_target", spotId: "spot_existing" },
    });
    expect(mocks.fetchSocialLinkMetadata).not.toHaveBeenCalled();
    expect(mocks.enrichSocialLinkMetadataWithProvider).not.toHaveBeenCalled();
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
    expect(mocks.ledgerRows).toHaveLength(0);
  });
});
