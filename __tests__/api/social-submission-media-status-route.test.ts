import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(async () => null),
  createSupabaseAdmin: vi.fn(() => ({})),
  loadProgress: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimiters: { standard: mocks.rateLimit },
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
}));

vi.mock("@/lib/social-spot-media-jobs", () => ({
  loadSocialMediaProgressForSubmissions: mocks.loadProgress,
}));

const submissionId = "11111111-1111-4111-8111-111111111111";

function request(ids: string) {
  return new NextRequest(
    `https://www.localley.io/api/spots/social-submissions/media-status?ids=${encodeURIComponent(ids)}`,
  );
}

describe("social submission media status API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.loadProgress.mockResolvedValue(new Map([
      [submissionId, [{
        id: "job-1",
        submissionId,
        revision: 2,
        ordinal: 0,
        mediaKind: "video",
        previewUrl: "https://private.example/signed-preview.jpg",
        state: "leased",
        attemptCount: 2,
        maxAttempts: 5,
        availableAt: new Date().toISOString(),
        publicErrorCode: "MEDIA_TEMPORARILY_UNAVAILABLE",
        result: { output: "private model evidence" },
      }]],
    ]));
  });

  it("returns only sanitized progress and maps leased work to processing", async () => {
    const { GET } = await import("@/app/api/spots/social-submissions/media-status/route");

    const response = await GET(request(submissionId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({
      submissions: {
        [submissionId]: [{
          id: "job-1",
          state: "processing",
          kind: "video",
          ordinal: 1,
          attempts: 2,
          maxAttempts: 5,
          publicErrorCode: "MEDIA_TEMPORARILY_UNAVAILABLE",
        }],
      },
    });
    expect(JSON.stringify(body)).not.toContain("signed-preview");
    expect(JSON.stringify(body)).not.toContain("private model evidence");
  });

  it("rejects requests without any valid submission IDs", async () => {
    const { GET } = await import("@/app/api/spots/social-submissions/media-status/route");

    const response = await GET(request("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(mocks.loadProgress).not.toHaveBeenCalled();
  });

  it("honors the standard API rate limiter", async () => {
    mocks.rateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: "limited" }, { status: 429 }),
    );
    const { GET } = await import("@/app/api/spots/social-submissions/media-status/route");

    const response = await GET(request(submissionId));

    expect(response.status).toBe(429);
    expect(mocks.loadProgress).not.toHaveBeenCalled();
  });
});
