import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ListVideo,
  Search,
  Sparkles,
  Video,
} from "lucide-react";
import { AppBackground } from "@/components/layout/app-background";
import { Button } from "@/components/ui/button";
import { createSupabaseAdmin } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Submitted Videos",
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
    providerName?: string | null;
  } | null;
  research: {
    candidates?: Candidate[];
    createdCandidates?: CreatedCandidate[];
  } | null;
};

function getStatusCopy(status: SubmissionRow["status"]) {
  switch (status) {
    case "spot_created":
      return {
        label: "Spot created",
        helper: "Localley created a new spot from this video.",
        icon: CheckCircle2,
        className: "border-emerald-200/25 bg-emerald-400/10 text-emerald-100",
      };
    case "spot_reused":
      return {
        label: "Matched spot",
        helper: "This video matched an existing Localley spot.",
        icon: CheckCircle2,
        className: "border-sky-200/25 bg-sky-400/10 text-sky-100",
      };
    case "needs_review":
      return {
        label: "Needs review",
        helper: "The video is saved, but exact place evidence needs a human check.",
        icon: Search,
        className: "border-amber-200/30 bg-amber-400/10 text-amber-100",
      };
    default:
      return {
        label: "Research queued",
        helper: "The video is saved and waiting for deeper research.",
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
    `${submission.platform} video`
  );
}

function getSubmissionImage(submission: SubmissionRow) {
  return submission.metadata?.imageUrl || submission.metadata?.thumbnailUrl || null;
}

function getCreatedCandidates(submission: SubmissionRow): CreatedCandidate[] {
  const created = submission.research?.createdCandidates || [];
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

async function getSubmissions(): Promise<SubmissionRow[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("social_spot_submissions")
    .select(
      "id, canonical_url, platform, status, spot_id, contributor_credit, extracted_name, extracted_address, extracted_city, research_confidence, research_summary, created_at, metadata, research",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[submitted-videos] Failed to load social submissions:", error.message);
    return [];
  }

  return (data || []) as SubmissionRow[];
}

export default async function SubmittedVideosPage() {
  const submissions = await getSubmissions();

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
              <Video className="h-4 w-4" />
              Submit video
            </Link>
          </Button>
        </div>

        <section className="mb-5 rounded-lg border border-violet-200/15 bg-[#100b1c]/86 p-5 shadow-xl shadow-violet-950/20 backdrop-blur-xl md:p-7">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-400/10 px-3 py-1 text-sm font-medium text-violet-100">
            <ListVideo className="h-4 w-4" />
            Submitted videos
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Video submission tracker
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-violet-50/65 md:text-base">
            Every TikTok or Instagram link submitted by the community lands here first. Created spots link directly; uncertain videos stay visible as review or research items.
          </p>
        </section>

        {submissions.length === 0 ? (
          <section className="rounded-lg border border-violet-200/15 bg-[#100b1c]/86 p-6 text-center shadow-xl shadow-violet-950/20 backdrop-blur-xl">
            <Sparkles className="mx-auto h-8 w-8 text-violet-200/70" />
            <h2 className="mt-3 text-xl font-bold text-white">No submitted videos yet</h2>
            <p className="mt-2 text-sm text-violet-50/60">
              Paste the first TikTok or Instagram spot video and it will show up here.
            </p>
          </section>
        ) : (
          <div className="grid gap-4">
            {submissions.map((submission) => {
              const status = getStatusCopy(submission.status);
              const StatusIcon = status.icon;
              const title = getSubmissionTitle(submission);
              const image = getSubmissionImage(submission);
              const createdCandidates = getCreatedCandidates(submission);
              const candidates = submission.research?.candidates || [];

              return (
                <article
                  key={submission.id}
                  className="overflow-hidden rounded-lg border border-violet-200/15 bg-[#100b1c]/86 shadow-xl shadow-violet-950/20 backdrop-blur-xl md:grid md:grid-cols-[220px_1fr]"
                >
                  <div className="relative aspect-video bg-violet-950/60 md:aspect-auto md:min-h-full">
                    {image ? (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${image})` }}
                      />
                    ) : (
                      <div className="flex h-full min-h-40 items-center justify-center">
                        <Video className="h-10 w-10 text-violet-100/35" />
                      </div>
                    )}
                    <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2 py-1 text-xs font-semibold uppercase text-white backdrop-blur">
                      {submission.platform}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold", status.className)}>
                            <StatusIcon className="h-3.5 w-3.5" />
                            {status.label}
                          </span>
                          <span className="text-xs text-violet-50/45">
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

                      <Button asChild variant="outline" className="shrink-0 rounded-lg border-violet-200/20 bg-white/[0.04] text-violet-50 hover:bg-violet-400/10 hover:text-white">
                        <a href={submission.canonical_url} target="_blank" rel="noreferrer">
                          Open video
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>

                    {submission.research_summary && (
                      <p className="mt-3 text-sm leading-6 text-violet-50/65">
                        {submission.research_summary}
                      </p>
                    )}

                    {createdCandidates.length > 0 ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {createdCandidates.map((candidate) => (
                          <Link
                            key={candidate.spotId || `${candidate.spotName}-${candidate.address}`}
                            href={candidate.spotId ? `/spots/${candidate.spotId}` : "/spots/submissions"}
                            className="rounded-lg border border-emerald-200/15 bg-emerald-400/10 p-3 text-sm transition-colors hover:border-emerald-200/35 hover:bg-emerald-400/15"
                          >
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
                    ) : candidates.length > 0 ? (
                      <div className="mt-4 rounded-lg border border-amber-200/20 bg-amber-400/10 p-3">
                        <p className="text-sm font-semibold text-amber-100">
                          Candidate places still need review
                        </p>
                        <div className="mt-2 grid gap-2">
                          {candidates.slice(0, 3).map((candidate) => (
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
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppBackground>
  );
}
