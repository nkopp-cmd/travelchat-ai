import { NextRequest, NextResponse } from "next/server";
import {
  loadSocialMediaProcessingForSubmissions,
  loadSocialMediaProgressForSubmissions,
} from "@/lib/social-spot-media-jobs";
import { rateLimiters } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const limited = await rateLimiters.standard(request);
  if (limited) return limited;

  const submissionIds = Array.from(new Set(
    (request.nextUrl.searchParams.get("ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => UUID_PATTERN.test(value)),
  )).slice(0, 20);
  if (submissionIds.length === 0) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Add at least one valid submission ID." } },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdmin();
  const [progress, processing] = await Promise.all([
    loadSocialMediaProgressForSubmissions({ supabase, submissionIds }),
    loadSocialMediaProcessingForSubmissions({ supabase, submissionIds }),
  ]);
  return NextResponse.json({
    submissions: Object.fromEntries(submissionIds.map((submissionId) => [
      submissionId,
      (progress.get(submissionId) || [])
        .filter((item) => item.state !== "cancelled")
        .map((item) => ({
          id: item.id,
          state: item.state === "leased" ? "processing" : item.state,
          kind: item.mediaKind,
          ordinal: item.ordinal + 1,
          attempts: item.attemptCount,
          maxAttempts: item.maxAttempts,
          publicErrorCode: item.publicErrorCode,
        })),
    ])),
    processing: Object.fromEntries(
      submissionIds
        .filter((submissionId) => processing.has(submissionId))
        .map((submissionId) => [submissionId, processing.get(submissionId)]),
    ),
  }, {
    headers: { "cache-control": "private, no-store" },
  });
}
