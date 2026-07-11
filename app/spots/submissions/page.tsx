import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImagePlus,
  Images,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";
import { AppBackground } from "@/components/layout/app-background";
import {
  SubmissionMediaProgress,
  SubmissionMediaProgressProvider,
  type SubmissionMediaProgressItem,
} from "@/components/spots/submission-media-progress";
import type { SocialMediaProcessingSummary } from "@/lib/social-spot-media-jobs";
import { Button } from "@/components/ui/button";
import { isAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase";
import {
  filterUnmatchedSocialPlaceIdentities,
} from "@/lib/social-spot-submissions";
import { loadSocialMediaProgressForSubmissions } from "@/lib/social-spot-media-jobs";
import { getFirstRealDisplaySpotPhoto } from "@/lib/spots/display-images";
import { cn } from "@/lib/utils";
import { SubmissionEvidenceForm } from "./evidence-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community Submissions",
  description: "Track community TikTok and Instagram spot submissions on Localley.",
};

type Candidate = {
  spotName?: string | null;
  address?: string | null;
  city?: string | null;
  status?: string | null;
  confidence?: number | null;
};

type CreatedCandidate = {
  spotId?: string | null;
  spotName?: string | null;
  address?: string | null;
  city?: string | null;
  status?: string | null;
  confidence?: number | null;
};

type SubmissionRow = {
  id: string;
  canonical_url: string;
  platform: string;
  status: "spot_created" | "spot_reused" | "needs_review" | "research_pending";
  spot_id: string | null;
  clerk_user_id: string | null;
  contributor_credit: string;
  extracted_name: string | null;
  extracted_address: string | null;
  extracted_city: string | null;
  research_confidence: number | null;
  research_summary: string | null;
  created_at: string;
  metadata: {
    title?: string | null;
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
    sourceLabel?: string | null;
    providerName?: string | null;
    mediaUrls?: string[];
    mediaAccessStatus?: "video_ready" | "carousel_images" | "cover_only" | "media_unavailable";
    videoDurationSeconds?: number | null;
    videoUrls?: string[];
    mediaCompleteness?: "complete" | "partial";
    mediaItemCount?: number;
    mediaExtractedCount?: number;
  } | null;
  research: {
    candidates?: Candidate[];
    createdCandidates?: CreatedCandidate[];
    mediaAnalysis?: {
      status?:
        | "video_analyzed"
        | "video_partially_analyzed"
        | "video_unavailable"
        | "images_extracted"
        | "media_partially_extracted"
        | "cover_only"
        | "media_unavailable";
      analyzedVideoCount?: number;
      totalVideoCount?: number;
    };
  } | null;
  media_processing_state: SocialMediaProcessingSummary["state"];
  media_processing_revision: number;
  media_item_count: number;
  media_succeeded_count: number;
  media_dead_letter_count: number;
  media_extraction_attempt_count: number;
  media_finalization_attempt_count: number;
};

type SubmissionStatusFilter = SubmissionRow["status"] | "all";

type SubmittedPostsPageProps = {
  searchParams: Promise<{
    status?: string;
    submission?: string;
    page?: string;
  }>;
};

const SUBMISSIONS_FETCH_PAGE_SIZE = 250;
const SUBMISSIONS_DISPLAY_PAGE_SIZE = 20;

const statusFilters: Array<{
  label: string;
  value: SubmissionStatusFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Needs source info", value: "research_pending" },
  { label: "Needs review", value: "needs_review" },
  { label: "Created", value: "spot_created" },
  { label: "Matched", value: "spot_reused" },
];

function getStatusCopy(status: SubmissionRow["status"]) {
  switch (status) {
    case "spot_created":
      return {
        label: "Spot created",
        helper: "Localley created a new spot from this post.",
        icon: CheckCircle2,
        className: "border-emerald-200/25 bg-emerald-400/10 text-emerald-100",
      };
    case "spot_reused":
      return {
        label: "Matched spot",
        helper: "This post matched an existing Localley spot.",
        icon: CheckCircle2,
        className: "border-sky-200/25 bg-sky-400/10 text-sky-100",
      };
    case "needs_review":
      return {
        label: "Needs review",
        helper: "The post is saved, but exact place evidence needs a human check.",
        icon: Search,
        className: "border-amber-200/30 bg-amber-400/10 text-amber-100",
      };
    default:
      return {
        label: "Needs source info",
        helper: "Saved, but Localley could not verify the exact place from the public post alone.",
        icon: Clock3,
        className: "border-violet-200/25 bg-violet-400/10 text-violet-100",
      };
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getSubmissionTitle(submission: SubmissionRow) {
  return (
    submission.extracted_name ||
    submission.metadata?.title?.replace(/\s*\|\s*TikTok\s*$/i, "") ||
    submission.metadata?.sourceLabel ||
    `${submission.platform} post`
  );
}

function getCreatedCandidates(submission: SubmissionRow): CreatedCandidate[] {
  const created = (submission.research?.createdCandidates || []).filter((candidate) =>
    Boolean(candidate.spotId),
  );
  if (created.length > 0) return created;
  if (!submission.spot_id) return [];

  return [
    {
      spotId: submission.spot_id,
      spotName: submission.extracted_name,
      address: submission.extracted_address,
      city: submission.extracted_city,
      status: submission.status,
      confidence: submission.research_confidence,
    },
  ];
}

function getPrimaryCreatedSpotId(submission: SubmissionRow): string | null {
  return getCreatedCandidates(submission).find((candidate) => candidate.spotId)?.spotId || null;
}

function getSubmissionImage(
  submission: SubmissionRow,
  primarySpotImages: Map<string, string>,
) {
  const socialImage = submission.metadata?.imageUrl || submission.metadata?.thumbnailUrl;
  if (socialImage) return socialImage;

  const spotId = getPrimaryCreatedSpotId(submission);
  return spotId ? primarySpotImages.get(spotId) || null : null;
}

async function loadPrimarySpotImages(
  submissions: SubmissionRow[],
): Promise<Map<string, string>> {
  const spotIds = Array.from(new Set(
    submissions.map(getPrimaryCreatedSpotId).filter((spotId): spotId is string => Boolean(spotId)),
  ));
  const images = new Map<string, string>();
  if (spotIds.length === 0) return images;

  const { data, error } = await createSupabaseAdmin()
    .from("spots")
    .select("id, photos")
    .in("id", spotIds);
  if (error) {
    console.error("[submitted-posts] Failed to load linked spot images:", error.message);
    return images;
  }

  for (const row of data || []) {
    const photos = Array.isArray(row.photos)
      ? row.photos.filter((photo): photo is string => typeof photo === "string")
      : [];
    const image = getFirstRealDisplaySpotPhoto(photos);
    if (image) images.set(String(row.id), image);
  }
  return images;
}

function hasUsableCandidatePlace(candidate: Candidate): boolean {
  return Boolean(candidate.spotName || candidate.address || candidate.city);
}

function getReviewCandidates(submission: SubmissionRow): Candidate[] {
  return (submission.research?.candidates || []).filter(hasUsableCandidatePlace);
}

function getPendingCandidates(submission: SubmissionRow): Candidate[] {
  const processed = submission.research?.createdCandidates || [];
  const resolvedResults = processed.filter((candidate) => Boolean(candidate.spotId));
  const unresolvedResults = filterUnmatchedSocialPlaceIdentities(
    processed.filter((candidate) => !candidate.spotId && hasUsableCandidatePlace(candidate)),
    resolvedResults,
  );
  if (unresolvedResults.length > 0) return unresolvedResults;

  return filterUnmatchedSocialPlaceIdentities(getReviewCandidates(submission), resolvedResults);
}

function getSubmissionStatusCopy(submission: SubmissionRow) {
  const createdCount = getCreatedCandidates(submission).length;
  const pendingCount = getPendingCandidates(submission).length;

  if (createdCount > 0 && pendingCount > 0) {
    return {
      label: `${createdCount} ready · ${pendingCount} needs review`,
      helper: "Some places are ready while other places from the same post still need evidence.",
      icon: Search,
      className: "border-amber-200/30 bg-amber-400/10 text-amber-100",
    };
  }
  if (createdCount > 1) {
    return {
      label: `${createdCount} spots ready`,
      helper: "Every verified place from this post has its own community spot.",
      icon: CheckCircle2,
      className: "border-emerald-200/25 bg-emerald-400/10 text-emerald-100",
    };
  }

  return getStatusCopy(submission.status);
}

function getMediaStatusCopy(submission: SubmissionRow) {
  if (submission.media_processing_state === "not_started") {
    return {
      label: "Awaiting full media check",
      icon: Clock3,
      className: "border-violet-200/25 bg-violet-400/10 text-violet-100",
    };
  }
  if (["review_required", "dead_letter"].includes(submission.media_processing_state)) {
    return {
      label: "Full media check needs review",
      icon: Search,
      className: "border-amber-200/25 bg-amber-400/10 text-amber-100",
    };
  }
  const analysisStatus = submission.research?.mediaAnalysis?.status;
  const mediaStatus = submission.metadata?.mediaAccessStatus;

  if (analysisStatus === "video_analyzed") {
    return {
      label: "Full video analyzed",
      icon: Video,
      className: "border-cyan-200/25 bg-cyan-400/10 text-cyan-100",
    };
  }
  if (analysisStatus === "video_partially_analyzed") {
    const analyzed = submission.research?.mediaAnalysis?.analyzedVideoCount || 0;
    const total = submission.research?.mediaAnalysis?.totalVideoCount ||
      submission.metadata?.videoUrls?.length || 0;
    return {
      label: total > 0 ? `${analyzed} of ${total} videos analyzed` : "Video partially analyzed",
      icon: Video,
      className: "border-amber-200/25 bg-amber-400/10 text-amber-100",
    };
  }
  if (analysisStatus === "media_partially_extracted") {
    const extracted = submission.metadata?.mediaExtractedCount || 0;
    const total = submission.metadata?.mediaItemCount || 0;
    return {
      label: total > 0
        ? `${extracted} of ${total} media items available`
        : "Post media partially available",
      icon: Images,
      className: "border-amber-200/25 bg-amber-400/10 text-amber-100",
    };
  }
  if (analysisStatus === "images_extracted") {
    const imageCount = submission.metadata?.mediaUrls?.length || 0;
    return {
      label: imageCount > 1 ? `${imageCount} images analyzed` : "Post images analyzed",
      icon: Images,
      className: "border-fuchsia-200/25 bg-fuchsia-400/10 text-fuchsia-100",
    };
  }
  if (mediaStatus === "carousel_images") {
    const imageCount = submission.metadata?.mediaUrls?.length || 0;
    return {
      label: imageCount > 1 ? `${imageCount} images available` : "Post images available",
      icon: Images,
      className: "border-fuchsia-200/25 bg-fuchsia-400/10 text-fuchsia-100",
    };
  }
  if (analysisStatus === "video_unavailable") {
    const coverChecked = Boolean(
      submission.metadata?.imageUrl || submission.metadata?.thumbnailUrl,
    );
    return {
      label: coverChecked ? "Video unavailable · cover analyzed" : "Video unavailable",
      icon: Images,
      className: "border-amber-200/25 bg-amber-400/10 text-amber-100",
    };
  }
  if (analysisStatus === "cover_only") {
    return {
      label: "Cover image analyzed",
      icon: Images,
      className: "border-violet-200/25 bg-violet-400/10 text-violet-100",
    };
  }
  if (mediaStatus === "cover_only") {
    return {
      label: "Cover image available",
      icon: Images,
      className: "border-violet-200/25 bg-violet-400/10 text-violet-100",
    };
  }
  if (mediaStatus === "video_ready") {
    return {
      label: "Video ready for analysis",
      icon: Video,
      className: "border-cyan-200/25 bg-cyan-400/10 text-cyan-100",
    };
  }
  if (submission.metadata?.imageUrl || submission.metadata?.thumbnailUrl) {
    return {
      label: "Cover image available",
      icon: Images,
      className: "border-violet-200/25 bg-violet-400/10 text-violet-100",
    };
  }

  return {
    label: "Public media unavailable",
    icon: Search,
    className: "border-white/15 bg-white/[0.05] text-violet-50/70",
  };
}

function parseStatusFilter(value: string | undefined): SubmissionStatusFilter {
  if (
    value === "spot_created" ||
    value === "spot_reused" ||
    value === "needs_review" ||
    value === "research_pending"
  ) {
    return value;
  }

  return "all";
}

function getFilterHref(status: SubmissionStatusFilter) {
  return status === "all" ? "/spots/submissions" : `/spots/submissions?status=${status}`;
}

function getPageHref(status: SubmissionStatusFilter, page: number) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/spots/submissions?${query}` : "/spots/submissions";
}

function getStatusCount(submissions: SubmissionRow[], status: SubmissionStatusFilter) {
  return submissions.filter((submission) => submissionMatchesStatus(submission, status)).length;
}

function submissionMatchesStatus(
  submission: SubmissionRow,
  status: SubmissionStatusFilter,
): boolean {
  if (status === "all") return true;
  const pendingCandidates = getPendingCandidates(submission);
  const createdCandidates = getCreatedCandidates(submission);

  if (status === "research_pending") {
    return (
      submission.status === "research_pending" ||
      pendingCandidates.some((candidate) => candidate.status === "research_pending")
    );
  }
  if (status === "needs_review") {
    return (
      submission.status === "needs_review" ||
      pendingCandidates.some((candidate) => candidate.status !== "research_pending")
    );
  }
  if (status === "spot_created") {
    return (
      submission.status === "spot_created" ||
      createdCandidates.some((candidate) => candidate.status === "spot_created")
    );
  }

  return (
    submission.status === "spot_reused" ||
    createdCandidates.some((candidate) => candidate.status === "spot_reused")
  );
}

const SUBMISSION_SELECT =
  "id, canonical_url, platform, status, spot_id, clerk_user_id, contributor_credit, extracted_name, extracted_address, extracted_city, research_confidence, research_summary, created_at, metadata, research, media_processing_state, media_processing_revision, media_item_count, media_succeeded_count, media_dead_letter_count, media_extraction_attempt_count, media_finalization_attempt_count";

async function getSubmissions(): Promise<{
  submissions: SubmissionRow[];
  error: string | null;
}> {
  const supabase = createSupabaseAdmin();
  const submissions: SubmissionRow[] = [];

  for (let from = 0; ; from += SUBMISSIONS_FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("social_spot_submissions")
      .select(SUBMISSION_SELECT)
      .order("created_at", { ascending: false })
      .range(from, from + SUBMISSIONS_FETCH_PAGE_SIZE - 1);

    if (error) {
      console.error("[submitted-posts] Failed to load social submissions:", error.message);
      return {
        submissions: [],
        error: "Could not load submitted posts. Please refresh in a moment.",
      };
    }

    submissions.push(...((data || []) as SubmissionRow[]));
    if (!data || data.length < SUBMISSIONS_FETCH_PAGE_SIZE) {
      break;
    }
  }

  return {
    submissions,
    error: null,
  };
}

export default async function SubmittedPostsPage({ searchParams }: SubmittedPostsPageProps) {
  const params = await searchParams;
  const { userId } = await auth();
  const activeStatus = parseStatusFilter(params.status);
  const highlightedSubmissionId = params.submission || null;
  const requestedPage = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const { submissions, error } = await getSubmissions();
  const matchingSubmissions =
    submissions.filter((submission) => submissionMatchesStatus(submission, activeStatus));
  const pageCount = Math.max(1, Math.ceil(matchingSubmissions.length / SUBMISSIONS_DISPLAY_PAGE_SIZE));
  const highlightedIndex = highlightedSubmissionId
    ? matchingSubmissions.findIndex((submission) => submission.id === highlightedSubmissionId)
    : -1;
  const initialPage = !params.page && highlightedIndex >= 0
    ? Math.floor(highlightedIndex / SUBMISSIONS_DISPLAY_PAGE_SIZE) + 1
    : requestedPage;
  const activePage = Math.min(initialPage, pageCount);
  const filteredSubmissions = matchingSubmissions.slice(
    (activePage - 1) * SUBMISSIONS_DISPLAY_PAGE_SIZE,
    activePage * SUBMISSIONS_DISPLAY_PAGE_SIZE,
  );
  const primarySpotImages = await loadPrimarySpotImages(filteredSubmissions);
  const mediaProgressBySubmission = await loadSocialMediaProgressForSubmissions({
    supabase: createSupabaseAdmin(),
    submissionIds: filteredSubmissions.map((submission) => submission.id),
  });
  const initialMediaProgress: Record<string, SubmissionMediaProgressItem[]> = Object.fromEntries(
    filteredSubmissions.map((submission) => [
    submission.id,
    (mediaProgressBySubmission.get(submission.id) || [])
      .filter((item) => item.state !== "cancelled")
      .map((item) => ({
        id: item.id,
        state: (item.state === "leased" ? "processing" : item.state) as
          SubmissionMediaProgressItem["state"],
        kind: item.mediaKind,
        ordinal: item.ordinal + 1,
        attempts: item.attemptCount,
        maxAttempts: item.maxAttempts,
        publicErrorCode: item.publicErrorCode,
      })),
    ]),
  );
  const initialMediaProcessing: Record<string, SocialMediaProcessingSummary> = Object.fromEntries(
    filteredSubmissions.map((submission) => [submission.id, {
      state: submission.media_processing_state,
      revision: submission.media_processing_revision,
      total: submission.media_item_count,
      succeeded: submission.media_succeeded_count,
      failed: submission.media_dead_letter_count,
      extractionAttempts: submission.media_extraction_attempt_count,
      finalizationAttempts: submission.media_finalization_attempt_count,
    }]),
  );
  const highlightedSubmissionMissing = Boolean(
    highlightedSubmissionId &&
      !submissions.some((submission) => submission.id === highlightedSubmissionId),
  );

  return (
    <AppBackground ambient fitParent>
      <div className="container mx-auto px-4 pb-24 pt-6 md:pb-10 md:pt-8">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="rounded-lg border-violet-200/20 bg-white/[0.055] text-violet-50 hover:bg-violet-400/10 hover:text-white">
            <Link href="/spots">
              <ArrowLeft className="h-4 w-4" />
              Spots
            </Link>
          </Button>
          <Button asChild className="rounded-lg bg-white text-violet-950 hover:bg-violet-50">
            <Link href="/spots/submit">
              <ImagePlus className="h-4 w-4" />
              Submit post
            </Link>
          </Button>
          {isAdminUser(userId) && (
            <Button asChild variant="outline" className="rounded-lg border-emerald-200/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15 hover:text-white">
              <Link href="/admin/spots/social-submissions">
                <ShieldCheck className="h-4 w-4" />
                Review recovery
              </Link>
            </Button>
          )}
        </div>

        <section className="mb-5 rounded-lg border border-violet-200/15 bg-[#100b1c]/[0.86] p-5 shadow-xl shadow-violet-950/20 backdrop-blur-xl md:p-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-400/10 px-3 py-1 text-sm font-medium text-violet-100">
            <Images className="h-4 w-4" />
            Community submissions
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Social post tracker
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-violet-50/65 md:text-base">
            Every TikTok or Instagram post shared by the Localley community lands here first. Created community spots link directly; uncertain posts stay visible as review or research items.
          </p>
        </section>

        {error ? (
          <section className="rounded-lg border border-rose-200/20 bg-rose-500/10 p-6 text-center shadow-xl shadow-violet-950/20 backdrop-blur-xl">
            <Search className="mx-auto h-8 w-8 text-rose-100/70" />
            <h2 className="mt-3 text-xl font-bold text-white">Tracker unavailable</h2>
            <p className="mt-2 text-sm text-rose-50/70">{error}</p>
          </section>
        ) : submissions.length === 0 ? (
          <section className="rounded-lg border border-violet-200/15 bg-[#100b1c]/[0.86] p-6 text-center shadow-xl shadow-violet-950/20 backdrop-blur-xl">
            <Sparkles className="mx-auto h-8 w-8 text-violet-200/70" />
            <h2 className="mt-3 text-xl font-bold text-white">No submitted posts yet</h2>
            <p className="mt-2 text-sm text-violet-50/60">
              Paste the first TikTok or Instagram spot post and it will show up here.
            </p>
          </section>
        ) : (
          <>
            <nav
              aria-label="Submission status filters"
              className="mb-4 flex gap-2 overflow-x-auto rounded-lg border border-violet-200/15 bg-[#100b1c]/[0.76] p-2 shadow-lg shadow-violet-950/20 backdrop-blur-xl"
            >
              {statusFilters.map((filter) => {
                const active = filter.value === activeStatus;

                return (
                  <Link
                    key={filter.value}
                    href={getFilterHref(filter.value)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                      active
                        ? "bg-white text-violet-950"
                        : "border border-violet-200/15 bg-white/[0.04] text-violet-50/70 hover:bg-violet-400/10 hover:text-white",
                    )}
                  >
                    {filter.label}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        active ? "bg-violet-950/10 text-violet-950" : "bg-white/10 text-violet-50/60",
                      )}
                    >
                      {getStatusCount(submissions, filter.value)}
                    </span>
                  </Link>
                );
              })}
            </nav>

            {highlightedSubmissionMissing && (
              <div role="status" className="mb-4 rounded-lg border border-amber-200/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                That submission could not be found. It may have been removed or the link may be incomplete.
              </div>
            )}

            {filteredSubmissions.length === 0 ? (
              <section className="rounded-lg border border-violet-200/15 bg-[#100b1c]/[0.86] p-6 text-center shadow-xl shadow-violet-950/20 backdrop-blur-xl">
                <Sparkles className="mx-auto h-8 w-8 text-violet-200/70" />
                <h2 className="mt-3 text-xl font-bold text-white">No posts in this status</h2>
                <p className="mt-2 text-sm text-violet-50/60">
                  Switch filters to see the rest of the submission queue.
                </p>
              </section>
            ) : (
              <SubmissionMediaProgressProvider
                initialProgress={initialMediaProgress}
                initialProcessing={initialMediaProcessing}
              >
              <div className="grid gap-4">
                {filteredSubmissions.map((submission) => {
              const mediaProgress = initialMediaProgress[submission.id] || [];
              const status = getSubmissionStatusCopy(submission);
              const StatusIcon = status.icon;
              const mediaStatus = getMediaStatusCopy(submission);
              const MediaStatusIcon = mediaStatus.icon;
              const title = getSubmissionTitle(submission);
              const image = getSubmissionImage(submission, primarySpotImages);
              const createdCandidates = getCreatedCandidates(submission);
              const pendingCandidates = getPendingCandidates(submission);
              const canAddEvidence = Boolean(
                userId &&
                  (submission.clerk_user_id === userId || isAdminUser(userId)),
              );
              const isHighlighted = submission.id === highlightedSubmissionId;

              return (
                <article
                  id={`submission-${submission.id}`}
                  key={submission.id}
                  className={cn(
                    "scroll-mt-24 overflow-hidden rounded-lg border bg-[#100b1c]/[0.86] shadow-xl shadow-violet-950/20 backdrop-blur-xl md:grid md:grid-cols-[220px_1fr]",
                    isHighlighted
                      ? "border-violet-200/50 ring-2 ring-violet-300/35"
                      : "border-violet-200/15",
                  )}
                >
                  <div className="relative aspect-video bg-violet-950/60 md:aspect-auto md:min-h-full">
                    {image ? (
                      <div
                        role="img"
                        aria-label={`${title} preview`}
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${image})` }}
                      />
                    ) : (
                      <div className="flex h-full min-h-40 items-center justify-center">
                        <Images className="h-10 w-10 text-violet-100/35" />
                      </div>
                    )}
                    <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2 py-1 text-xs font-semibold uppercase text-white backdrop-blur">
                      {submission.platform}
                    </div>
                    <a
                      href={submission.canonical_url}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-black/20 backdrop-blur transition-colors hover:bg-black/72 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 sm:hidden"
                    >
                      Open post
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold", status.className)}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {status.label}
                          </span>
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold", mediaStatus.className)}>
                            <MediaStatusIcon className="h-3.5 w-3.5" />
                            {mediaStatus.label}
                          </span>
                          <span className="text-xs text-violet-50/65">
                            {formatDate(submission.created_at)}
                          </span>
                        </div>
                        <h2 className="text-xl font-bold leading-tight text-white">
                          {title}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-violet-50/60">
                          {submission.extracted_city || submission.extracted_address || status.helper}
                        </p>
                      </div>

                      <Button asChild variant="outline" className="hidden shrink-0 rounded-lg border-violet-200/20 bg-white/[0.04] text-violet-50 hover:bg-violet-400/10 hover:text-white sm:inline-flex">
                        <a href={submission.canonical_url} target="_blank" rel="noreferrer">
                          Open post
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>

                    {submission.research_summary && (
                      <p className="mt-3 text-sm leading-6 text-violet-50/65">
                        {submission.research_summary}
                      </p>
                    )}

                    {mediaProgress.length > 0 || submission.media_processing_state ? (
                      <SubmissionMediaProgress
                        submissionId={submission.id}
                        items={mediaProgress}
                        processing={initialMediaProcessing[submission.id]}
                        className="mt-4 border-violet-200/15 bg-black/20"
                      />
                    ) : null}

                    {createdCandidates.length > 0 && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {createdCandidates.map((candidate) => (
                          <Link
                            key={candidate.spotId || `${candidate.spotName}-${candidate.address}`}
                            href={candidate.spotId ? `/spots/${candidate.spotId}` : "/spots/submissions"}
                            className="rounded-lg border border-emerald-200/15 bg-emerald-400/10 p-3 text-sm transition-colors hover:border-emerald-200/35 hover:bg-emerald-400/15"
                          >
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-emerald-100/70">
                              Community spot
                            </span>
                            <span className="block font-semibold text-white">
                              {candidate.spotName || "Created spot"}
                            </span>
                            <span className="mt-1 block text-violet-50/60">
                              {candidate.city || candidate.address || "Open spot"}
                              {typeof candidate.confidence === "number"
                                ? ` · ${Math.round(candidate.confidence * 100)}%`
                                : ""}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {pendingCandidates.length > 0 ? (
                      <div className="mt-4 rounded-lg border border-amber-200/20 bg-amber-400/10 p-3">
                        <p className="text-sm font-semibold text-amber-100">
                          {createdCandidates.length > 0
                            ? "Other places from this post still need review"
                            : "Candidate places still need review"}
                        </p>
                        <div className="mt-2 grid gap-2">
                          {pendingCandidates.map((candidate) => (
                            <div
                              key={`${candidate.spotName}-${candidate.address}`}
                              className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-violet-50/70"
                            >
                              {candidate.spotName || "Unverified place"}
                              {candidate.city ? ` · ${candidate.city}` : ""}
                              {typeof candidate.confidence === "number"
                                ? ` · ${Math.round(candidate.confidence * 100)}%`
                                : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : submission.status === "research_pending" ? (
                      <div className="mt-4 rounded-lg border border-violet-200/20 bg-violet-400/10 p-3">
                        <p className="text-sm font-semibold text-violet-100">
                          Needs more source info
                        </p>
                        <p className="mt-1 text-sm leading-6 text-violet-50/65">
                          This post is saved, but Localley could not read enough public caption, image, or location evidence to create a spot yet.
                        </p>
                      </div>
                    ) : null}
                    {canAddEvidence &&
                      (pendingCandidates.length > 0 ||
                        ["needs_review", "research_pending"].includes(submission.status)) && (
                        <SubmissionEvidenceForm
                          submissionId={submission.id}
                          canonicalUrl={submission.canonical_url}
                          defaultCity={submission.extracted_city}
                        />
                      )}
                  </div>
                </article>
              );
                })}
              </div>
              </SubmissionMediaProgressProvider>
            )}
            {pageCount > 1 && (
              <nav aria-label="Submission pages" className="mt-5 flex items-center justify-center gap-2">
                {activePage > 1 && (
                  <Button asChild variant="outline" className="rounded-lg border-violet-200/20 bg-white/[0.04] text-violet-50 hover:bg-violet-400/10 hover:text-white">
                    <Link href={getPageHref(activeStatus, activePage - 1)}>Previous</Link>
                  </Button>
                )}
                <span className="px-3 text-sm text-violet-50/65">
                  Page {activePage} of {pageCount}
                </span>
                {activePage < pageCount && (
                  <Button asChild variant="outline" className="rounded-lg border-violet-200/20 bg-white/[0.04] text-violet-50 hover:bg-violet-400/10 hover:text-white">
                    <Link href={getPageHref(activeStatus, activePage + 1)}>Next</Link>
                  </Button>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </AppBackground>
  );
}
