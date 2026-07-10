import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submissionId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ response: null, userId: "admin_test" })),
  scheduleBackfill: vi.fn(async () => [submissionId]),
  processWorker: vi.fn(async () => NextResponse.json({
    success: true,
    inspected: 1,
    claimed: 1,
    succeeded: 1,
    retried: 0,
    finalized: 1,
    deadLettered: 0,
  })),
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/app/api/cron/process-social-submissions/route", () => ({
  GET: mocks.processWorker,
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/social-spot-media-jobs", () => ({
  scheduleLegacySocialMediaBackfill: mocks.scheduleBackfill,
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => {
      const result = () => ({ data: mocks.rows, error: null });
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        lt: vi.fn(() => query),
        in: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        is: vi.fn(async () => result()),
        then: (
          resolve: (value: ReturnType<typeof result>) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    }),
  })),
}));

function request(
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  return new NextRequest("https://www.localley.io/api/admin/spots/social-submissions/backfill", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("admin social submission legacy backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "backfill-plan-secret";
    delete process.env.APIFY_API_TOKEN;
    mocks.requireAdmin.mockResolvedValue({ response: null, userId: "admin_test" });
    mocks.scheduleBackfill.mockResolvedValue([submissionId]);
    mocks.processWorker.mockResolvedValue(NextResponse.json({
      success: true,
      inspected: 1,
      claimed: 1,
      succeeded: 1,
      retried: 0,
      finalized: 1,
      deadLettered: 0,
    }));
    mocks.rows.length = 0;
    mocks.rows.push({
      id: submissionId,
      platform: "tiktok",
      status: "spot_created",
      spot_id: "22222222-2222-4222-8222-222222222222",
      extracted_name: "Legacy Seoul Spot",
      created_at: "2026-07-05T00:00:00.000Z",
    });
  });

  it("requires an authenticated admin before reading legacy rows", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
    });
    const { POST } = await import("@/app/api/admin/spots/social-submissions/backfill/route");

    const response = await POST(request({ dryRun: true }));

    expect(response.status).toBe(403);
    expect(mocks.scheduleBackfill).not.toHaveBeenCalled();
  });

  it("creates a short-lived review plan and executes only those exact IDs", async () => {
    const { POST } = await import("@/app/api/admin/spots/social-submissions/backfill/route");
    const previewResponse = await POST(request({
      dryRun: true,
      includeResolved: true,
      limit: 1,
    }));
    const preview = await previewResponse.json();

    expect(previewResponse.status).toBe(200);
    expect(preview.eligible).toEqual([expect.objectContaining({
      id: submissionId,
      name: "Legacy Seoul Spot",
      hasSpot: true,
    })]);
    expect(preview.planToken).toMatch(/^[^.]+\.[^.]+$/);

    const executeResponse = await POST(request({
      dryRun: false,
      planToken: preview.planToken,
    }, "legacy-run-0001"));
    const executed = await executeResponse.json();

    expect(executeResponse.status).toBe(202);
    expect(executed).toMatchObject({
      dryRun: false,
      claimed: [submissionId],
      skipped: [],
      worker: {
        started: true,
        status: 200,
        summary: expect.objectContaining({ success: true, succeeded: 1 }),
      },
    });
    expect(mocks.scheduleBackfill).toHaveBeenCalledWith(expect.objectContaining({
      submissionIds: [submissionId],
      cutoff: "2026-07-10T09:00:00.000Z",
      limit: 1,
      includeInstagram: false,
      includeResolved: true,
    }));
    expect(mocks.processWorker).toHaveBeenCalledTimes(1);
    const workerRequest = mocks.processWorker.mock.calls[0]?.[0] as NextRequest;
    expect(workerRequest.headers.get("authorization")).toBe("Bearer backfill-plan-secret");
  });

  it("does not invoke the worker when replay claims no new rows", async () => {
    mocks.scheduleBackfill.mockResolvedValueOnce([]);
    const { POST } = await import("@/app/api/admin/spots/social-submissions/backfill/route");
    const previewResponse = await POST(request({ dryRun: true, includeResolved: true, limit: 1 }));
    const preview = await previewResponse.json();

    const response = await POST(request({
      dryRun: false,
      planToken: preview.planToken,
    }, "legacy-run-replay"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.claimed).toEqual([]);
    expect(body.worker).toEqual({ started: false, status: null, summary: null });
    expect(mocks.processWorker).not.toHaveBeenCalled();
  });

  it("rejects Instagram planning until its provider is configured", async () => {
    const { POST } = await import("@/app/api/admin/spots/social-submissions/backfill/route");

    const response = await POST(request({ dryRun: true, includeInstagram: true }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("provider_not_configured");
    expect(mocks.scheduleBackfill).not.toHaveBeenCalled();
  });

  it("rejects execution without an idempotency key or valid signed plan", async () => {
    const { POST } = await import("@/app/api/admin/spots/social-submissions/backfill/route");

    const missingKey = await POST(request({ dryRun: false, planToken: "x".repeat(40) }));
    const invalidPlan = await POST(request(
      { dryRun: false, planToken: `${"x".repeat(40)}.${"y".repeat(40)}` },
      "legacy-run-0002",
    ));

    expect(missingKey.status).toBe(400);
    expect(invalidPlan.status).toBe(400);
    expect(mocks.scheduleBackfill).not.toHaveBeenCalled();
  });
});
