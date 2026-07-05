import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "clerk_test" })),
  createSupabaseAdmin: vi.fn(),
  rateLimitStrict: vi.fn(async () => null),
  revalidateTag: vi.fn(),
  geocodeWithCascade: vi.fn(async () => ({ lat: 37.5665, lng: 126.9780, provider: "nominatim" })),
  fetchSocialLinkMetadata: vi.fn(async () => ({
    title: "Hidden Seoul Cafe | TikTok",
    description: "Small cafe",
    imageUrl: "https://cdn.example.com/cafe.jpg",
    finalUrl: "https://vm.tiktok.com/ZMh123",
  })),
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
  })),
  contributorRows: [] as Array<Record<string, unknown>>,
  submissionRows: [] as Array<Record<string, unknown>>,
  spotRows: [] as Array<Record<string, unknown>>,
  ledgerRows: [] as Array<Record<string, unknown>>,
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

vi.mock("@/lib/social-spot-submissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social-spot-submissions")>();
  return {
    ...actual,
    fetchSocialLinkMetadata: mocks.fetchSocialLinkMetadata,
    researchSocialSpotLink: mocks.researchSocialSpotLink,
  };
});

function createSupabaseMock() {
  return {
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
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async (_column: string, id: string) => {
              const row = mocks.contributorRows.find((item) => item.id === id);
              if (row) Object.assign(row, payload);
              return { error: null };
            }),
          })),
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
                  query.filters.every(([column, value]) => submission[column] === value),
                );
                return { data: row || null, error: null };
              }),
            };
            return query;
          }),
          insert: vi.fn((payload: Record<string, unknown>) => {
            const row = {
              id: "submission_test",
              ...payload,
            };
            mocks.submissionRows.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: row, error: null })),
              })),
            };
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
            mocks.spotRows.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: row, error: null })),
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

describe("/api/spots/social-submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED = "true";
    mocks.contributorRows.length = 0;
    mocks.submissionRows.length = 0;
    mocks.spotRows.length = 0;
    mocks.ledgerRows.length = 0;
    mocks.createSupabaseAdmin.mockReturnValue(createSupabaseMock());
    mocks.rateLimitStrict.mockResolvedValue(null);
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
      address: { en: "1 Seoullo, Seoul" },
      location: "POINT(126.9780000 37.5665000)",
      localley_score: 5,
      photos: ["https://cdn.example.com/cafe.jpg"],
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
      photos: ["https://cdn.example.com/noodle-post.jpg"],
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
      photos: ["https://cdn.example.com/cafe-frame.jpg"],
    });
    expect(mocks.spotRows[1]).toMatchObject({
      photos: ["https://cdn.example.com/dessert-frame.jpg"],
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
    });
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
    });
    expect(mocks.submissionRows).toHaveLength(1);
    expect(mocks.ledgerRows).toHaveLength(0);
    expect(mocks.researchSocialSpotLink).not.toHaveBeenCalled();
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
});
