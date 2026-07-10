import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { scheduleLegacySocialMediaBackfill } from "@/lib/social-spot-media-jobs";
import { createSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

const ROUTE = "/api/admin/spots/social-submissions/backfill";
const LEGACY_CUTOFF = "2026-07-10T09:00:00.000Z";
const PLAN_TTL_MS = 10 * 60 * 1000;

const requestSchema = z.object({
  dryRun: z.boolean().default(true),
  limit: z.number().int().min(1).max(5).default(5),
  includeInstagram: z.boolean().default(false),
  includeResolved: z.boolean().default(false),
  planToken: z.string().trim().min(32).max(8192).optional(),
}).strict();

type BackfillPlan = {
  version: 1;
  submissionIds: string[];
  cutoff: string;
  limit: number;
  includeInstagram: boolean;
  includeResolved: boolean;
  expiresAt: string;
};

function planSecret(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}

function encodePlan(plan: BackfillPlan, secret: string): string {
  const payload = Buffer.from(JSON.stringify(plan)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodePlan(token: string, secret: string): BackfillPlan | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = createHmac("sha256", secret).update(payload).digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as BackfillPlan;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.submissionIds) ||
      parsed.submissionIds.length < 1 ||
      parsed.submissionIds.length > 5 ||
      parsed.cutoff !== LEGACY_CUTOFF ||
      !Number.isFinite(Date.parse(parsed.expiresAt)) ||
      Date.parse(parsed.expiresAt) <= Date.now()
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { response, userId } = await requireAdmin(ROUTE, "social_submission_backfill");
  if (response) return response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: parsed.error.issues[0]?.message } },
      { status: 400 },
    );
  }
  const secret = planSecret();
  if (!secret) {
    return NextResponse.json(
      { error: { code: "configuration_error", message: "Backfill plan signing is unavailable." } },
      { status: 503 },
    );
  }

  if (parsed.data.dryRun) {
    if (parsed.data.includeInstagram && !process.env.APIFY_API_TOKEN?.trim()) {
      return NextResponse.json(
        { error: { code: "provider_not_configured", message: "Configure the Instagram provider before planning Instagram backfill." } },
        { status: 409 },
      );
    }
    const supabase = createSupabaseAdmin();
    const baseQuery = supabase
      .from("social_spot_submissions")
      .select("id, platform, status, spot_id, extracted_name, created_at")
      .eq("media_processing_state", "not_started")
      .eq("media_processing_revision", 0)
      .lt("created_at", LEGACY_CUTOFF)
      .in("platform", parsed.data.includeInstagram ? ["tiktok", "instagram"] : ["tiktok"])
      .order("created_at", { ascending: true })
      .limit(parsed.data.limit);
    const { data, error } = parsed.data.includeResolved
      ? await baseQuery
      : await baseQuery.is("spot_id", null);
    if (error) {
      return NextResponse.json(
        { error: { code: "database_error", message: "Could not prepare the legacy backfill plan." } },
        { status: 500 },
      );
    }
    const eligible = (data || []).map((row) => ({
      id: String(row.id),
      platform: String(row.platform),
      status: String(row.status),
      name: typeof row.extracted_name === "string" ? row.extracted_name : null,
      hasSpot: Boolean(row.spot_id),
      createdAt: String(row.created_at),
    }));
    if (eligible.length === 0) {
      return NextResponse.json({
        dryRun: true,
        eligible: [],
        planToken: null,
        cutoff: LEGACY_CUTOFF,
        provider: { instagramConfigured: Boolean(process.env.APIFY_API_TOKEN?.trim()) },
      });
    }
    const expiresAt = new Date(Date.now() + PLAN_TTL_MS).toISOString();
    const plan: BackfillPlan = {
      version: 1,
      submissionIds: eligible.map((row) => row.id),
      cutoff: LEGACY_CUTOFF,
      limit: eligible.length,
      includeInstagram: parsed.data.includeInstagram,
      includeResolved: parsed.data.includeResolved,
      expiresAt,
    };
    return NextResponse.json({
      dryRun: true,
      eligible,
      planToken: encodePlan(plan, secret),
      cutoff: LEGACY_CUTOFF,
      expiresAt,
      provider: { instagramConfigured: Boolean(process.env.APIFY_API_TOKEN?.trim()) },
    });
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    return NextResponse.json(
      { error: { code: "idempotency_key_required", message: "Add an Idempotency-Key between 8 and 100 characters." } },
      { status: 400 },
    );
  }
  const plan = parsed.data.planToken ? decodePlan(parsed.data.planToken, secret) : null;
  if (!plan) {
    return NextResponse.json(
      { error: { code: "invalid_plan", message: "Create a fresh dry-run plan before executing backfill." } },
      { status: 400 },
    );
  }
  if (plan.includeInstagram && !process.env.APIFY_API_TOKEN?.trim()) {
    return NextResponse.json(
      { error: { code: "provider_not_configured", message: "The Instagram provider is no longer configured." } },
      { status: 409 },
    );
  }

  const claimed = await scheduleLegacySocialMediaBackfill({
    supabase: createSupabaseAdmin(),
    submissionIds: plan.submissionIds,
    cutoff: plan.cutoff,
    limit: plan.limit,
    includeInstagram: plan.includeInstagram,
    includeResolved: plan.includeResolved,
  });
  const claimedSet = new Set(claimed);
  return NextResponse.json({
    dryRun: false,
    requestedBy: userId,
    requestKey: createHmac("sha256", secret).update(idempotencyKey).digest("hex").slice(0, 16),
    claimed,
    skipped: plan.submissionIds.filter((submissionId) => !claimedSet.has(submissionId)),
    worker: "queued_for_reconciliation",
  }, { status: claimed.length > 0 ? 202 : 200 });
}
