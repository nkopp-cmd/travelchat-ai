import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";
import { geocodeWithCascade } from "@/lib/geocoding";
import { rateLimiters } from "@/lib/rate-limit";
import {
  SOCIAL_RESEARCH_CONFIDENCE_THRESHOLD,
  SOCIAL_SUBMISSION_TOKEN_AWARD,
  buildAnonymousContributorEmail,
  buildPublicCreditName,
  fetchSocialLinkMetadata,
  getResearchCandidates,
  normalizeContributorEmail,
  normalizeSocialSpotUrl,
  researchSocialSpotLink,
  socialSpotSubmissionSchema,
  type SocialSpotResearchCandidate,
  type SocialSpotSubmissionStatus,
  type SocialSpotResearchResult,
} from "@/lib/social-spot-submissions";
import { validateBody } from "@/lib/validations";

export const runtime = "nodejs";
export const maxDuration = 60;

function isSocialSpotSubmissionsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED === "true";
}

function formatPoint(lng: number, lat: number): string {
  return `POINT(${lng.toFixed(7)} ${lat.toFixed(7)})`;
}

function getSpotCategory(research: SocialSpotResearchCandidate): string {
  return research.category || "Food";
}

function getSpotDescription(research: SocialSpotResearchCandidate): string {
  if (research.description) return research.description;
  if (research.researchSummary) return research.researchSummary;
  return "A community-submitted place from a social travel link, queued for deeper Localley review.";
}

function canCreateSpot(research: SocialSpotResearchCandidate): boolean {
  return Boolean(
    research.status === "candidate" &&
      research.spotName &&
      research.address &&
      research.city &&
      research.confidence >= SOCIAL_RESEARCH_CONFIDENCE_THRESHOLD,
  );
}

async function findExistingSpot(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  research: SocialSpotResearchCandidate,
): Promise<string | null> {
  if (!research.spotName || !research.address) return null;

  const addressSnippet = research.address.slice(0, 80).replace(/[%_]/g, "\\$&");
  const { data, error } = await supabase
    .from("spots")
    .select("id")
    .ilike("name->>en", research.spotName)
    .ilike("address->>en", `%${addressSnippet}%`)
    .limit(1);

  if (error) {
    console.warn("[social-submissions] Existing spot lookup failed:", error.message);
    return null;
  }

  return data?.[0]?.id || null;
}

async function createSpotFromResearch({
  supabase,
  research,
  imageUrl,
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  research: SocialSpotResearchCandidate;
  imageUrl: string | null;
}): Promise<{ spotId: string | null; status: SocialSpotSubmissionStatus }> {
  if (!canCreateSpot(research)) {
    return {
      spotId: null,
      status: research.status === "research_pending" ? "research_pending" : "needs_review",
    };
  }

  const existingSpotId = await findExistingSpot(supabase, research);
  if (existingSpotId) {
    return { spotId: existingSpotId, status: "spot_reused" };
  }

  const geocoded = await geocodeWithCascade(
    research.address!,
    research.city!,
    research.spotName!,
  );

  if (!geocoded) {
    return { spotId: null, status: "needs_review" };
  }

  const category = getSpotCategory(research);
  const { data: insertedSpot, error } = await supabase
    .from("spots")
    .insert({
      name: { en: research.spotName },
      description: { en: getSpotDescription(research) },
      location: formatPoint(geocoded.lng, geocoded.lat),
      address: { en: research.address },
      category,
      subcategories: research.subcategories,
      localley_score: research.localleyScore || 3,
      local_percentage: research.localPercentage || 55,
      best_times: { en: research.bestTime || "Check current opening hours before going." },
      photos: imageUrl ? [imageUrl] : [],
      tips: { en: research.tips },
      verified: false,
      trending_score: Math.min(1, Math.max(0, (research.localPercentage || 50) / 100)),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const retrySpotId = await findExistingSpot(supabase, research);
      if (retrySpotId) {
        return { spotId: retrySpotId, status: "spot_reused" };
      }
    }

    console.error("[social-submissions] Failed to create spot:", error);
    return { spotId: null, status: "needs_review" };
  }

  revalidateTag("spots", "default");
  return { spotId: insertedSpot?.id || null, status: "spot_created" };
}

function summarizeCandidateStatuses(
  results: Array<{ spotId: string | null; status: SocialSpotSubmissionStatus }>,
): SocialSpotSubmissionStatus {
  if (results.some((result) => result.status === "spot_created")) return "spot_created";
  if (results.some((result) => result.status === "spot_reused")) return "spot_reused";
  if (results.some((result) => result.status === "research_pending")) return "research_pending";
  return "needs_review";
}

export async function POST(req: NextRequest) {
  try {
    if (!isSocialSpotSubmissionsEnabled()) {
      return NextResponse.json(
        {
          error: {
            code: "social_submissions_disabled",
            message: "Social spot submissions are not enabled yet.",
          },
        },
        { status: 404 },
      );
    }

    const limited = await rateLimiters.strict(req);
    if (limited) return limited;

    const validation = await validateBody(req, socialSpotSubmissionSchema);
    if (!validation.success) {
      return Errors.validationError(validation.error);
    }

    let normalized;
    try {
      normalized = normalizeSocialSpotUrl(validation.data.url);
    } catch (error) {
      return Errors.validationError(
        error instanceof Error ? error.message : "Paste a valid TikTok or Instagram link.",
      );
    }

    const { userId } = await auth();
    const supabase = createSupabaseAdmin();
    const email = validation.data.email
      ? normalizeContributorEmail(validation.data.email)
      : buildAnonymousContributorEmail(normalized.canonicalUrl);
    const publicCreditName = buildPublicCreditName({
      email,
      contributorName: validation.data.contributorName,
    });
    const now = new Date().toISOString();

    const { data: contributor, error: contributorError } = await supabase
      .from("spot_contributors")
      .upsert(
        {
          email,
          display_name: validation.data.contributorName || null,
          public_credit_name: publicCreditName,
          last_submitted_at: now,
        },
        { onConflict: "email" },
      )
      .select("id, total_tokens, public_credit_name")
      .single();

    if (contributorError || !contributor) {
      console.error("[social-submissions] Contributor upsert failed:", contributorError);
      return Errors.databaseError("Could not save contributor attribution.");
    }

    const { data: existingSubmission, error: existingError } = await supabase
      .from("social_spot_submissions")
      .select("id, status, spot_id, token_awarded, research_confidence, research_summary, research")
      .eq("canonical_url", normalized.canonicalUrl)
      .maybeSingle();

    if (existingError) {
      console.error("[social-submissions] Existing submission lookup failed:", existingError);
      return Errors.databaseError("Could not check existing submission.");
    }

    if (existingSubmission) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        submission: {
          id: existingSubmission.id,
          status: existingSubmission.status,
          spotId: existingSubmission.spot_id,
        },
        contributor: {
          creditName: contributor.public_credit_name,
          tokensAwarded: 0,
          totalTokens: contributor.total_tokens || 0,
        },
        research: {
          confidence: existingSubmission.research_confidence,
          summary: existingSubmission.research_summary,
          candidates: Array.isArray(existingSubmission.research?.candidates)
            ? existingSubmission.research.candidates
            : undefined,
        },
      });
    }

    const metadata = await fetchSocialLinkMetadata(normalized.canonicalUrl);
    const research = await researchSocialSpotLink({
      canonicalUrl: normalized.canonicalUrl,
      platform: normalized.platform,
      metadata,
      notes: validation.data.notes,
      cityHint: validation.data.cityHint,
    });
    const candidates = getResearchCandidates(research);
    const candidateResults = [];

    for (const candidate of candidates) {
      const spotResult = await createSpotFromResearch({
        supabase,
        research: candidate,
        imageUrl: candidate.imageUrl || metadata.imageUrl || metadata.thumbnailUrl || null,
      });

      candidateResults.push({
        ...spotResult,
        spotName: candidate.spotName,
        address: candidate.address,
        city: candidate.city,
        confidence: candidate.confidence,
        summary: candidate.researchSummary,
      });
    }

    const primaryResult =
      candidateResults.find((result) => result.spotId) ||
      candidateResults[0] ||
      { spotId: null, status: "research_pending" as SocialSpotSubmissionStatus };
    const submissionStatus = summarizeCandidateStatuses(candidateResults);
    const enrichedResearch: SocialSpotResearchResult = {
      ...research,
      candidates,
      createdCandidates: candidateResults,
    } as SocialSpotResearchResult & {
      createdCandidates: typeof candidateResults;
    };

    const tokenAward = SOCIAL_SUBMISSION_TOKEN_AWARD;
    const { data: submission, error: submissionError } = await supabase
      .from("social_spot_submissions")
      .insert({
        contributor_id: contributor.id,
        clerk_user_id: userId,
        spot_id: primaryResult.spotId,
        source_url: validation.data.url,
        canonical_url: normalized.canonicalUrl,
        platform: normalized.platform,
        status: submissionStatus,
        contributor_credit: contributor.public_credit_name,
        token_awarded: tokenAward,
        notes: validation.data.notes || null,
        city_hint: validation.data.cityHint || null,
        extracted_name: research.spotName,
        extracted_address: research.address,
        extracted_city: research.city,
        localley_score: research.localleyScore,
        local_percentage: research.localPercentage,
        research_confidence: Number(research.confidence.toFixed(2)),
        research_summary: research.researchSummary,
        research: enrichedResearch,
        metadata,
      })
      .select("id, status, spot_id")
      .single();

    if (submissionError || !submission) {
      if (submissionError?.code === "23505") {
        const { data: duplicateSubmission } = await supabase
          .from("social_spot_submissions")
          .select("id, status, spot_id, research_confidence, research_summary, research")
          .eq("canonical_url", normalized.canonicalUrl)
          .maybeSingle();

        return NextResponse.json({
          success: true,
          duplicate: true,
          submission: duplicateSubmission
            ? {
                id: duplicateSubmission.id,
                status: duplicateSubmission.status,
                spotId: duplicateSubmission.spot_id,
              }
            : undefined,
          contributor: {
            creditName: contributor.public_credit_name,
            tokensAwarded: 0,
            totalTokens: contributor.total_tokens || 0,
          },
          research: duplicateSubmission
            ? {
                confidence: duplicateSubmission.research_confidence,
                summary: duplicateSubmission.research_summary,
                candidates: Array.isArray(duplicateSubmission.research?.candidates)
                  ? duplicateSubmission.research.candidates
                  : undefined,
              }
            : undefined,
        });
      }

      console.error("[social-submissions] Submission insert failed:", submissionError);
      return Errors.databaseError("Could not save the social spot submission.");
    }

    const ledgerResult = await supabase
      .from("contribution_token_ledger")
      .insert({
        contributor_id: contributor.id,
        submission_id: submission.id,
        delta: tokenAward,
        reason: "social_spot_submission",
        metadata: {
          platform: normalized.platform,
          status: submission.status,
        },
      });

    let totalTokens = contributor.total_tokens || 0;
    if (!ledgerResult.error) {
      totalTokens += tokenAward;
      await supabase
        .from("spot_contributors")
        .update({
          total_tokens: totalTokens,
          last_submitted_at: now,
        })
        .eq("id", contributor.id);
    } else {
      console.error("[social-submissions] Token ledger insert failed:", ledgerResult.error);
    }

    return NextResponse.json({
      success: true,
      duplicate: false,
      submission: {
        id: submission.id,
        status: submission.status,
        spotId: submission.spot_id,
      },
      contributor: {
        creditName: contributor.public_credit_name,
        tokensAwarded: ledgerResult.error ? 0 : tokenAward,
        totalTokens,
      },
      research: {
        confidence: research.confidence,
        summary: research.researchSummary,
        localleyScore: research.localleyScore,
        localPercentage: research.localPercentage,
        candidates: enrichedResearch.candidates,
      },
      spotUrl: submission.spot_id ? `/spots/${submission.spot_id}` : null,
      spots: candidateResults
        .filter((result) => result.spotId)
        .map((result) => ({
          spotId: result.spotId,
          spotUrl: `/spots/${result.spotId}`,
          status: result.status,
          name: result.spotName,
          address: result.address,
          city: result.city,
          confidence: result.confidence,
        })),
    });
  } catch (error) {
    return handleApiError(error, "social-spot-submissions");
  }
}
