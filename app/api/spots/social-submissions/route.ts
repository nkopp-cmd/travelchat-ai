import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { isAdminUser } from "@/lib/admin-auth";
import { Errors, handleApiError } from "@/lib/api-errors";
import {
  buildSpotPhotoUrls,
  findBestGooglePlaceMatch,
  getGooglePlacesApiKey,
  type PlacePhotoSearchResult,
} from "@/lib/place-images";
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
  socialSpotEvidenceSchema,
  socialSpotSubmissionSchema,
  type SocialSpotResearchCandidate,
  type SocialSpotSubmissionStatus,
  type SocialSpotResearchResult,
  type SocialLinkMetadata,
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

function normalizePlaceName(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isMissingGooglePlaceIdColumn(error: {
  code?: string | null;
  message?: string | null;
} | null | undefined): boolean {
  return Boolean(
    error &&
      (error.code === "42703" ||
        /google_place_id.*does not exist|column.*google_place_id/i.test(error.message || "")),
  );
}

function canUseTransliteratedPlaceMatch(
  research: SocialSpotResearchCandidate,
  place: PlacePhotoSearchResult | null | undefined,
): place is PlacePhotoSearchResult {
  if (!place?.displayName || !research.spotName) return false;
  if (research.confidence < 0.7) return false;
  if (!place.formattedAddress || !place.location || place.photos.length === 0) return false;

  const placeName = normalizePlaceName(place.displayName);
  const researchName = normalizePlaceName(research.spotName);

  return Boolean(placeName && researchName && placeName === researchName);
}

async function enrichResearchWithGooglePlace(
  research: SocialSpotResearchCandidate,
): Promise<{
  address: string;
  location: { lat: number; lng: number };
  photos: string[];
  placeName: string | null;
  placeId: string | null;
  query: string | null;
  usedTransliteratedNameFallback: boolean;
} | null> {
  if (!research.spotName || !research.address) return null;

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    console.warn("[social-submissions] Google Places key missing; keeping candidate in review.");
    return null;
  }

  try {
    const match = await findBestGooglePlaceMatch(
      research.spotName,
      research.address,
      research.category,
      apiKey,
      { timeoutMs: 12_000, maxResults: 5 },
    );
    const usedTransliteratedNameFallback =
      !match.place && canUseTransliteratedPlaceMatch(research, match.rejectedPlace);
    const place = match.place || (usedTransliteratedNameFallback ? match.rejectedPlace : null);
    const photos = place ? buildSpotPhotoUrls(place.photos) : [];

    if (!place?.formattedAddress || !place.location || photos.length === 0) {
      return null;
    }

    return {
      address: place.formattedAddress,
      location: {
        lat: place.location.latitude,
        lng: place.location.longitude,
      },
      photos,
      placeName: place.displayName,
      placeId: place.placeId,
      query: match.query,
      usedTransliteratedNameFallback,
    };
  } catch (error) {
    console.warn(
      "[social-submissions] Google place enrichment failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
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

async function findExistingSpotByGooglePlaceId(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  googlePlaceId: string | null,
): Promise<string | null> {
  if (!googlePlaceId) return null;

  const { data, error } = await supabase
    .from("spots")
    .select("id")
    .eq("google_place_id", googlePlaceId)
    .limit(1);

  if (error) {
    if (!isMissingGooglePlaceIdColumn(error)) {
      console.warn("[social-submissions] Existing Google place lookup failed:", error.message);
    }
    return null;
  }

  return data?.[0]?.id || null;
}

async function createSpotFromResearch({
  supabase,
  research,
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  research: SocialSpotResearchCandidate;
}): Promise<{
  spotId: string | null;
  status: SocialSpotSubmissionStatus;
  enrichmentStatus?: "place_photo_ready" | "place_photo_missing";
  placeName?: string | null;
  placeId?: string | null;
  photoCount?: number;
  placeMatchQuery?: string | null;
  usedTransliteratedNameFallback?: boolean;
}> {
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

  const placeEnrichment = await enrichResearchWithGooglePlace(research);
  if (!placeEnrichment) {
    return {
      spotId: null,
      status: "needs_review",
      enrichmentStatus: "place_photo_missing",
    };
  }

  const existingGooglePlaceSpotId = await findExistingSpotByGooglePlaceId(
    supabase,
    placeEnrichment.placeId,
  );
  if (existingGooglePlaceSpotId) {
    return {
      spotId: existingGooglePlaceSpotId,
      status: "spot_reused",
      enrichmentStatus: "place_photo_ready",
      placeName: placeEnrichment.placeName,
      placeId: placeEnrichment.placeId,
      photoCount: placeEnrichment.photos.length,
      placeMatchQuery: placeEnrichment.query,
      usedTransliteratedNameFallback: placeEnrichment.usedTransliteratedNameFallback,
    };
  }

  const category = getSpotCategory(research);
  const spotPayload = {
      name: { en: research.spotName },
      description: { en: getSpotDescription(research) },
      location: formatPoint(placeEnrichment.location.lng, placeEnrichment.location.lat),
      address: { en: placeEnrichment.address },
      category,
      subcategories: research.subcategories,
      localley_score: research.localleyScore || 3,
      local_percentage: research.localPercentage || 55,
      best_times: { en: research.bestTime || "Check current opening hours before going." },
      photos: placeEnrichment.photos,
      google_place_id: placeEnrichment.placeId,
      tips: { en: research.tips },
      verified: false,
      trending_score: Math.min(1, Math.max(0, (research.localPercentage || 50) / 100)),
    };
  let insertResult = await supabase
    .from("spots")
    .insert(spotPayload)
    .select("id")
    .single();

  if (isMissingGooglePlaceIdColumn(insertResult.error)) {
    const { google_place_id: _googlePlaceId, ...legacySpotPayload } = spotPayload;
    void _googlePlaceId;
    insertResult = await supabase
      .from("spots")
      .insert(legacySpotPayload)
      .select("id")
      .single();
  }

  const { data: insertedSpot, error } = insertResult;

  if (error) {
    if (error.code === "23505") {
      const retrySpotId =
        await findExistingSpotByGooglePlaceId(supabase, placeEnrichment.placeId) ||
        await findExistingSpot(supabase, research);
      if (retrySpotId) {
        return { spotId: retrySpotId, status: "spot_reused" };
      }
    }

    console.error("[social-submissions] Failed to create spot:", error);
    return { spotId: null, status: "needs_review" };
  }

  revalidateTag("spots", "default");
  return {
    spotId: insertedSpot?.id || null,
    status: "spot_created",
    enrichmentStatus: "place_photo_ready",
    placeName: placeEnrichment.placeName,
    placeId: placeEnrichment.placeId,
    photoCount: placeEnrichment.photos.length,
    placeMatchQuery: placeEnrichment.query,
    usedTransliteratedNameFallback: placeEnrichment.usedTransliteratedNameFallback,
  };
}

function summarizeCandidateStatuses(
  results: Array<{ spotId: string | null; status: SocialSpotSubmissionStatus }>,
): SocialSpotSubmissionStatus {
  if (results.some((result) => result.status === "spot_created")) return "spot_created";
  if (results.some((result) => result.status === "spot_reused")) return "spot_reused";
  if (results.some((result) => result.status === "research_pending")) return "research_pending";
  return "needs_review";
}

function hasUnresolvedCandidateResults(research: unknown): boolean {
  if (!research || typeof research !== "object") return false;
  const createdCandidates = (research as {
    createdCandidates?: Array<{
      spotId?: string | null;
      status?: SocialSpotSubmissionStatus | null;
    }>;
  }).createdCandidates;

  return Boolean(
    createdCandidates?.some(
      (candidate) =>
        !candidate.spotId &&
        ["needs_review", "research_pending"].includes(candidate.status || "needs_review"),
    ),
  );
}

function buildEvidenceNotes(input: {
  existingNotes?: string | null;
  placeHint?: string;
  notes?: string;
}): string | null {
  const parts = [
    input.existingNotes,
    input.placeHint ? `Place hint: ${input.placeHint}` : null,
    input.notes ? `Extra source details: ${input.notes}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("\n\n").slice(0, 1000) : null;
}

async function createCandidateResults({
  supabase,
  candidates,
}: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  candidates: SocialSpotResearchCandidate[];
}) {
  const candidateResults = [];

  for (const candidate of candidates) {
    const spotResult = await createSpotFromResearch({
      supabase,
      research: candidate,
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

  return candidateResults;
}

type CandidateResultRecord = Awaited<ReturnType<typeof createCandidateResults>>[number];

function mergePreviouslyResolvedCandidates(
  previousResearch: unknown,
  currentResults: CandidateResultRecord[],
): CandidateResultRecord[] {
  if (!previousResearch || typeof previousResearch !== "object") return currentResults;
  const previousResults = (previousResearch as { createdCandidates?: unknown }).createdCandidates;
  if (!Array.isArray(previousResults)) return currentResults;

  const merged = [...currentResults];
  const resolvedSpotIds = new Set(
    currentResults.map((candidate) => candidate.spotId).filter(Boolean),
  );

  for (const previous of previousResults) {
    if (!previous || typeof previous !== "object") continue;
    const candidate = previous as Partial<CandidateResultRecord>;
    if (!candidate.spotId || resolvedSpotIds.has(candidate.spotId)) continue;
    if (!candidate.status || !["spot_created", "spot_reused"].includes(candidate.status)) continue;

    merged.push(candidate as CandidateResultRecord);
    resolvedSpotIds.add(candidate.spotId);
  }

  return merged;
}

type StoredSubmissionRecord = {
  id: string;
  status: SocialSpotSubmissionStatus;
  spot_id: string | null;
  research_confidence: number | null;
  research_summary: string | null;
  research?: {
    spotName?: string | null;
    address?: string | null;
    city?: string | null;
    candidates?: SocialSpotResearchCandidate[];
    createdCandidates?: Array<{
      spotId?: string | null;
      status?: string | null;
      spotName?: string | null;
      address?: string | null;
      city?: string | null;
      confidence?: number | null;
    }>;
  } | null;
};

function buildDuplicateSubmissionPayload(
  submission: StoredSubmissionRecord,
  contributor: {
    public_credit_name: string;
    total_tokens?: number | null;
  },
) {
  const spots = (submission.research?.createdCandidates || [])
    .filter((candidate) => candidate.spotId)
    .map((candidate) => ({
      spotId: candidate.spotId as string,
      spotUrl: `/spots/${candidate.spotId}`,
      status: candidate.status || submission.status,
      name: candidate.spotName || null,
      address: candidate.address || null,
      city: candidate.city || null,
      confidence: candidate.confidence ?? submission.research_confidence ?? 0,
    }));

  if (spots.length === 0 && submission.spot_id) {
    spots.push({
      spotId: submission.spot_id,
      spotUrl: `/spots/${submission.spot_id}`,
      status: submission.status,
      name: submission.research?.spotName || null,
      address: submission.research?.address || null,
      city: submission.research?.city || null,
      confidence: submission.research_confidence ?? 0,
    });
  }

  return {
    success: true,
    duplicate: true,
    submission: {
      id: submission.id,
      status: submission.status,
      spotId: submission.spot_id,
    },
    contributor: {
      creditName: contributor.public_credit_name,
      tokensAwarded: 0,
      totalTokens: contributor.total_tokens || 0,
    },
    research: {
      confidence: submission.research_confidence,
      summary: submission.research_summary,
      candidates: Array.isArray(submission.research?.candidates)
        ? submission.research.candidates
        : undefined,
    },
    spotUrl: submission.spot_id ? `/spots/${submission.spot_id}` : null,
    spots,
  };
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
    if (!userId) {
      return Errors.unauthorized("Sign in to submit a community spot.");
    }

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
      return NextResponse.json(
        buildDuplicateSubmissionPayload(existingSubmission, contributor),
      );
    }

    const metadata = await fetchSocialLinkMetadata(normalized.canonicalUrl);
    let resolvedCanonicalUrl = normalized.canonicalUrl;
    try {
      const resolved = normalizeSocialSpotUrl(metadata.finalUrl);
      if (resolved.platform === normalized.platform) {
        resolvedCanonicalUrl = resolved.canonicalUrl;
      }
    } catch {
      // Keep the validated submitted URL when a platform redirect is unreadable.
    }

    if (metadata.finalUrl) {
      const duplicateSelect =
        "id, status, spot_id, research_confidence, research_summary, research";
      let redirectedSubmission: StoredSubmissionRecord | null = null;
      let redirectedError: { message: string } | null = null;

      if (resolvedCanonicalUrl !== normalized.canonicalUrl) {
        const canonicalMatch = await supabase
          .from("social_spot_submissions")
          .select(duplicateSelect)
          .eq("canonical_url", resolvedCanonicalUrl)
          .maybeSingle();
        redirectedSubmission = canonicalMatch.data;
        redirectedError = canonicalMatch.error;
      }

      if (!redirectedSubmission && !redirectedError) {
        const metadataMatch = await supabase
          .from("social_spot_submissions")
          .select(duplicateSelect)
          .eq("metadata->>finalUrl", resolvedCanonicalUrl)
          .maybeSingle();
        redirectedSubmission = metadataMatch.data;
        redirectedError = metadataMatch.error;
      }

      if (redirectedError) {
        console.error("[social-submissions] Redirected duplicate lookup failed:", redirectedError);
        return Errors.databaseError("Could not check the resolved social post.");
      }
      if (redirectedSubmission) {
        return NextResponse.json(
          buildDuplicateSubmissionPayload(redirectedSubmission, contributor),
        );
      }
    }

    const research = await researchSocialSpotLink({
      canonicalUrl: resolvedCanonicalUrl,
      platform: normalized.platform,
      metadata,
      notes: validation.data.notes,
      cityHint: validation.data.cityHint,
    });
    const candidates = getResearchCandidates(research);
    const candidateResults = await createCandidateResults({ supabase, candidates });

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
        canonical_url: resolvedCanonicalUrl,
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
          .eq("canonical_url", resolvedCanonicalUrl)
          .maybeSingle();

        if (duplicateSubmission) {
          return NextResponse.json(
            buildDuplicateSubmissionPayload(duplicateSubmission, contributor),
          );
        }
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

export async function PATCH(req: NextRequest) {
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

    const validation = await validateBody(req, socialSpotEvidenceSchema);
    if (!validation.success) {
      return Errors.validationError(validation.error);
    }

    let validatedCanonical;
    try {
      validatedCanonical = normalizeSocialSpotUrl(validation.data.canonicalUrl);
    } catch (error) {
      return Errors.validationError(
        error instanceof Error ? error.message : "This submission has an invalid social link.",
      );
    }

    const { userId } = await auth();
    if (!userId) {
      return Errors.unauthorized("Sign in to add evidence to a community submission.");
    }

    const supabase = createSupabaseAdmin();
    const { data: existingSubmission, error: existingError } = await supabase
      .from("social_spot_submissions")
      .select("id, status, spot_id, clerk_user_id, canonical_url, platform, notes, city_hint, metadata, research")
      .eq("id", validation.data.submissionId)
      .eq("canonical_url", validatedCanonical.canonicalUrl)
      .maybeSingle();

    if (existingError) {
      console.error("[social-submissions] Evidence lookup failed:", existingError);
      return Errors.databaseError("Could not load this submission.");
    }

    if (!existingSubmission) {
      return Errors.notFound("Submission");
    }

    if (existingSubmission.clerk_user_id !== userId && !isAdminUser(userId)) {
      return Errors.forbidden("Only the original contributor can add evidence to this submission.");
    }

    if (
      ["spot_created", "spot_reused"].includes(existingSubmission.status) &&
      !hasUnresolvedCandidateResults(existingSubmission.research)
    ) {
      return Errors.validationError("This submission already has a Localley spot.");
    }

    let normalized;
    try {
      normalized = normalizeSocialSpotUrl(existingSubmission.canonical_url);
    } catch (error) {
      return Errors.validationError(
        error instanceof Error ? error.message : "This submission has an invalid social link.",
      );
    }

    const evidenceNotes = buildEvidenceNotes({
      existingNotes: existingSubmission.notes,
      placeHint: validation.data.placeHint,
      notes: validation.data.notes,
    });
    const cityHint = validation.data.cityHint || existingSubmission.city_hint || undefined;
    const metadata = {
      ...(existingSubmission.metadata || {}),
      finalUrl: normalized.canonicalUrl,
    } as SocialLinkMetadata;
    const research = await researchSocialSpotLink({
      canonicalUrl: normalized.canonicalUrl,
      platform: normalized.platform,
      metadata,
      notes: evidenceNotes || undefined,
      cityHint,
    });
    const candidates = getResearchCandidates(research);
    const candidateResults = await createCandidateResults({ supabase, candidates });
    const mergedCandidateResults = mergePreviouslyResolvedCandidates(
      existingSubmission.research,
      candidateResults,
    );
    const primaryResult =
      (existingSubmission.spot_id
        ? mergedCandidateResults.find(
            (result) => result.spotId === existingSubmission.spot_id,
          ) || {
          spotId: existingSubmission.spot_id,
          status: existingSubmission.status as SocialSpotSubmissionStatus,
        }
        : null) ||
      mergedCandidateResults.find((result) => result.spotId) ||
      mergedCandidateResults[0] ||
      { spotId: null, status: "research_pending" as SocialSpotSubmissionStatus };
    const submissionStatus = summarizeCandidateStatuses(mergedCandidateResults);
    const previousEvidence = Array.isArray(existingSubmission.research?.contributorEvidence)
      ? existingSubmission.research.contributorEvidence
      : [];
    const contributorEvidence = [
      ...previousEvidence,
      {
        submittedAt: new Date().toISOString(),
        clerkUserId: userId,
        placeHint: validation.data.placeHint || null,
        cityHint: validation.data.cityHint || null,
        notes: validation.data.notes || null,
      },
    ].slice(-10);
    const enrichedResearch: SocialSpotResearchResult = {
      ...research,
      candidates,
      createdCandidates: mergedCandidateResults,
      contributorEvidence,
    } as SocialSpotResearchResult & {
      createdCandidates: typeof mergedCandidateResults;
      contributorEvidence: typeof contributorEvidence;
    };

    const { data: updatedSubmission, error: updateError } = await supabase
      .from("social_spot_submissions")
      .update({
        spot_id: primaryResult.spotId,
        status: submissionStatus,
        notes: evidenceNotes,
        city_hint: cityHint || null,
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
      .eq("id", existingSubmission.id)
      .select("id, status, spot_id")
      .single();

    if (updateError || !updatedSubmission) {
      console.error("[social-submissions] Evidence update failed:", updateError);
      return Errors.databaseError("Could not save the added evidence.");
    }

    return NextResponse.json({
      success: true,
      submission: {
        id: updatedSubmission.id,
        status: updatedSubmission.status,
        spotId: updatedSubmission.spot_id,
      },
      research: {
        confidence: research.confidence,
        summary: research.researchSummary,
        localleyScore: research.localleyScore,
        localPercentage: research.localPercentage,
        candidates: enrichedResearch.candidates,
      },
      spotUrl: updatedSubmission.spot_id ? `/spots/${updatedSubmission.spot_id}` : null,
      spots: mergedCandidateResults
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
    return handleApiError(error, "social-spot-submissions-evidence");
  }
}
