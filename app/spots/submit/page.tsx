"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Images,
  Instagram,
  Loader2,
  Mail,
  Sparkles,
  Ticket,
  User,
} from "lucide-react";
import { AppBackground } from "@/components/layout/app-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { extractSocialUrl } from "@/lib/social-share-target";
import { filterUnmatchedSocialPlaceIdentities } from "@/lib/social-spot-submissions";

type SubmissionResponse = {
  success: boolean;
  duplicate?: boolean;
  submission?: {
    id: string;
    status: "spot_created" | "spot_reused" | "needs_review" | "research_pending";
    spotId: string | null;
  };
  contributor?: {
    creditName: string;
    tokensAwarded: number;
    totalTokens: number;
  };
  research?: {
    confidence: number | null;
    summary: string | null;
    localleyScore?: number | null;
    localPercentage?: number | null;
    candidates?: Array<{
      spotName: string | null;
      address: string | null;
      city: string | null;
      confidence: number;
      status: string;
    }>;
  };
  spotUrl?: string | null;
  spots?: Array<{
    spotId: string;
    spotUrl: string;
    status: string;
    name: string | null;
    address: string | null;
    city: string | null;
    confidence: number;
  }>;
  mediaProcessing?: {
    state: string;
    total: number;
    expected: number;
    coverage: string;
    trackerUrl: string;
  };
  error?: {
    message: string;
  };
};

const statusLabel: Record<NonNullable<SubmissionResponse["submission"]>["status"], string> = {
  spot_created: "Spot added",
  spot_reused: "Matched existing spot",
  needs_review: "Queued for review",
  research_pending: "Needs source info",
};

const socialSpotSubmissionsEnabled =
  process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED === "true";

function getSubmissionTrackerHref(result: SubmissionResponse | null): string {
  const submissionId = result?.submission?.id;
  if (!submissionId) return "/spots/submissions";

  return `/spots/submissions?submission=${submissionId}#submission-${submissionId}`;
}

function getCandidateKey(candidate: {
  spotName?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
}): string {
  return [candidate.spotName || candidate.name, candidate.address, candidate.city]
    .map((value) => value?.trim().toLowerCase() || "")
    .join("|");
}

function getUnresolvedCandidates(result: SubmissionResponse | null) {
  const candidates = result?.research?.candidates || [];
  const resolved = (result?.spots || []).map((spot) => ({
    spotId: spot.spotId,
    spotName: spot.name,
    address: spot.address,
    city: spot.city,
  }));
  return filterUnmatchedSocialPlaceIdentities(candidates, resolved);
}

function SocialSubmissionsUnavailable() {
  return (
    <AppBackground>
      <div className="mx-auto max-w-3xl space-y-5 pb-8">
        <Link
          href="/spots"
          className="inline-flex min-h-10 items-center rounded-full border border-violet-200/15 bg-white/[0.055] px-3 text-sm text-violet-50/70 transition-colors hover:bg-violet-400/10 hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to spots
        </Link>
        <Link
          href="/spots/submissions"
          className="ml-2 inline-flex min-h-10 items-center rounded-full border border-violet-200/15 bg-white/[0.055] px-3 text-sm text-violet-50/70 transition-colors hover:bg-violet-400/10 hover:text-white"
        >
          <Images className="mr-2 h-4 w-4" />
          Track submissions
        </Link>

        <section className="rounded-lg border border-violet-200/15 bg-[#100b1c]/[0.86] p-5 shadow-lg shadow-violet-950/20 backdrop-blur-xl sm:p-7">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-400/10 px-3 py-1 text-sm font-medium text-violet-100">
            <Sparkles className="h-4 w-4" />
            Coming soon
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Social spot submissions are not open yet
          </h1>
          <p className="mt-3 text-sm leading-6 text-violet-50/65 md:text-base">
            The contribution flow is being prepared. Browse the current Localley spots while submissions are closed.
          </p>
          <Button
            asChild
            className="mt-5 h-11 rounded-lg bg-white text-violet-950 hover:bg-violet-50"
          >
            <Link href="/spots">Open spots</Link>
          </Button>
        </section>
      </div>
    </AppBackground>
  );
}

function SubmitSpotForm() {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [contributorName, setContributorName] = useState("");
  const [cityHint, setCityHint] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmissionResponse | null>(null);
  const [shareHandoff, setShareHandoff] = useState<"received" | "unsupported" | null>(null);
  const { isLoaded, isSignedIn } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl =
      extractSocialUrl(params.get("url")) ||
      extractSocialUrl(params.get("text")) ||
      extractSocialUrl(params.get("title"));

    const hasSharedPayload = ["url", "text", "title"].some((key) => params.has(key));
    if (sharedUrl) {
      setUrl(sharedUrl);
      setShareHandoff("received");
    } else if (hasSharedPayload) {
      setShareHandoff("unsupported");
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/spots/social-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          email: email.trim() || undefined,
          contributorName: contributorName || undefined,
          cityHint: cityHint || undefined,
          notes: notes || undefined,
        }),
      });
      const body = (await response.json()) as SubmissionResponse;

      if (!response.ok) {
        throw new Error(body.error?.message || "Could not submit the spot.");
      }

      const normalizedResult = {
        ...body,
        spotUrl: body.spotUrl || (body.submission?.spotId ? `/spots/${body.submission.spotId}` : null),
      };
      const unresolvedCount = getUnresolvedCandidates(normalizedResult).length;
      setResult(normalizedResult);
      toast({
        title: body.duplicate ? "Already submitted" : "Submission saved",
        description: body.spots?.length
          ? `${body.spots.length} spot${body.spots.length === 1 ? "" : "s"} ready${
              unresolvedCount > 0 ? `; ${unresolvedCount} still needs review.` : "."
            }`
          : "Saved to community submissions for research/review.",
      });
    } catch (error) {
      toast({
        title: "Submission failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const unresolvedCandidates = getUnresolvedCandidates(result);
  const readyCount = result?.spots?.length || 0;
  const remainingCandidateCount = Math.max(0, unresolvedCandidates.length - 6);
  const isMediaQueued = Boolean(
    result?.mediaProcessing &&
      !["completed", "not_started", "schema_unavailable"].includes(result.mediaProcessing.state),
  );
  const signInRedirect = `/sign-in?redirect_url=${encodeURIComponent(
    url ? `/spots/submit?url=${encodeURIComponent(url)}` : "/spots/submit",
  )}`;

  return (
    <AppBackground>
      <div className="mx-auto max-w-5xl space-y-5 pb-8">
        <Link
          href="/spots"
          className="inline-flex min-h-10 items-center rounded-full border border-violet-200/15 bg-white/[0.055] px-3 text-sm text-violet-50/70 transition-colors hover:bg-violet-400/10 hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to spots
        </Link>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-violet-200/15 bg-[#100b1c]/[0.86] p-4 shadow-lg shadow-violet-950/20 backdrop-blur-xl sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-400/10 px-3 py-1 text-sm font-medium text-violet-100">
                  <Sparkles className="h-4 w-4" />
                  Community discovery
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                  Drop a social post link
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-50/65">
                  Paste a TikTok or Instagram post, reel, carousel, or video. Localley checks every distinct place and queues verified spots.
                </p>
              </div>
              <div className="flex gap-2">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-violet-100">
                  <Instagram className="h-5 w-5" />
                </span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-violet-100">
                  <ImagePlus className="h-5 w-5" />
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {shareHandoff === "received" ? (
                <div role="status" className="rounded-lg border border-emerald-200/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                  Shared post received. Sign in and submit when ready.
                </div>
              ) : shareHandoff === "unsupported" ? (
                <div role="alert" className="rounded-lg border border-amber-200/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                  The shared item did not include a TikTok or Instagram post URL. Paste its link below.
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="social-url" className="text-violet-50">
                  TikTok or Instagram post URL
                </Label>
                <Input
                  id="social-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  required
                  inputMode="url"
                  className="border-violet-200/15 bg-white/[0.06] text-white placeholder:text-violet-50/55"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-violet-50">
                    Email <span className="text-violet-50/65">(optional)</span>
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-200/60" />
                    <Input
                      id="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="For credits and history"
                      type="email"
                      className="border-violet-200/15 bg-white/[0.06] pl-9 text-white placeholder:text-violet-50/55"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contributor-name" className="text-violet-50">
                    Credit name <span className="text-violet-50/65">(optional)</span>
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-200/60" />
                    <Input
                      id="contributor-name"
                      value={contributorName}
                      onChange={(event) => setContributorName(event.target.value)}
                      placeholder="Optional"
                      className="border-violet-200/15 bg-white/[0.06] pl-9 text-white placeholder:text-violet-50/55"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-violet-50">
                    City or neighborhood <span className="text-violet-50/65">(optional)</span>
                  </Label>
                  <Input
                    id="city"
                    value={cityHint}
                    onChange={(event) => setCityHint(event.target.value)}
                    placeholder="Seoul, Seongsu, Ikseon-dong..."
                    className="border-violet-200/15 bg-white/[0.06] text-white placeholder:text-violet-50/55"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-violet-50">
                    Place clues <span className="text-violet-50/65">(optional)</span>
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Place name, sign text, nearest station, caption clue, or address"
                    className="min-h-24 border-violet-200/15 bg-white/[0.06] text-white placeholder:text-violet-50/55"
                  />
                </div>
              </div>

              {isLoaded && !isSignedIn ? (
                <div className="flex flex-col gap-3 rounded-lg border border-violet-200/20 bg-violet-400/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-violet-50/75">
                    Sign in to save this post to the community tracker.
                  </p>
                  <Button asChild className="h-11 shrink-0 rounded-lg bg-white text-violet-950 hover:bg-violet-50">
                    <Link href={signInRedirect}>Sign in to submit</Link>
                  </Button>
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={isSubmitting || !isLoaded || !isSignedIn}
                aria-busy={isSubmitting}
                className="h-12 w-full rounded-lg bg-violet-500 text-base font-bold text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400 sm:w-auto"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isSubmitting ? "Researching post..." : "Submit post"}
              </Button>
            </form>
          </section>

          <aside className="rounded-lg border border-violet-200/15 bg-[#100b1c]/[0.86] p-4 shadow-lg shadow-violet-950/20 backdrop-blur-xl sm:p-5">
            {result ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="font-semibold text-white">
                      {result.spots?.length && unresolvedCandidates.length
                        ? "Partially processed"
                        : readyCount > 1
                          ? `${readyCount} spots ready`
                        : result.submission
                          ? statusLabel[result.submission.status]
                          : "Submission saved"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-violet-50/60">
                      {readyCount > 0
                        ? `${readyCount} verified spot${readyCount === 1 ? " is" : "s are"} ready from this post.`
                        : isMediaQueued
                          ? "Saved. Localley is retrieving every image and video before verifying places."
                          : "Saved to community submissions for source review."}
                    </p>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Images className="h-4 w-4 text-violet-300" />
                      Community submission tracker
                    </span>
                    <p className="mt-1 text-sm leading-6 text-violet-50/65">
                      This post is saved in the community tracker with its research status and any created spots.
                    </p>
                  </div>

                  {result.spots && result.spots.length > 0 && (
                    <div className="rounded-lg border border-emerald-200/15 bg-emerald-400/10 p-3">
                      <span className="text-sm font-semibold text-white">Community spots ready</span>
                      <div className="mt-2 grid gap-2">
                        {result.spots.map((spot) => (
                          <Link
                            key={spot.spotId}
                            href={spot.spotUrl}
                            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-violet-50/80 transition-colors hover:border-violet-200/35 hover:bg-white/10 hover:text-white"
                          >
                            <span className="block font-semibold text-white">
                              {spot.name || "Created spot"}
                            </span>
                            <span className="mt-0.5 block text-xs text-violet-50/55">
                              {spot.city || "Location"} · {Math.round(spot.confidence * 100)}% confidence
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {unresolvedCandidates.length > 0 && (
                    <div className="rounded-lg border border-amber-200/20 bg-amber-400/10 p-3">
                      <span className="text-sm font-semibold text-amber-100">
                        {result.spots?.length
                          ? "Other places still need review"
                          : "Candidate places need review"}
                      </span>
                      <div className="mt-2 grid gap-2">
                        {unresolvedCandidates.slice(0, 6).map((candidate) => (
                          <div
                            key={getCandidateKey(candidate)}
                            className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-violet-50/75"
                          >
                            <span className="block font-semibold text-white">
                              {candidate.spotName || "Unverified place"}
                            </span>
                            <span className="mt-0.5 block text-xs text-violet-50/55">
                              {candidate.city || candidate.address || "More source evidence needed"}
                              {typeof candidate.confidence === "number"
                                ? ` · ${Math.round(candidate.confidence * 100)}% confidence`
                                : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                      {remainingCandidateCount > 0 ? (
                        <Link
                          href={getSubmissionTrackerHref(result)}
                          className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-amber-100 underline decoration-amber-200/40 underline-offset-4"
                        >
                          {remainingCandidateCount} more in tracker
                        </Link>
                      ) : null}
                    </div>
                  )}

                  <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                    <span className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Ticket className="h-4 w-4 text-violet-300" />
                      Tokens
                    </span>
                    <p className="mt-1 text-sm text-violet-50/65">
                      +{result.contributor?.tokensAwarded || 0} awarded, {result.contributor?.totalTokens || 0} total
                    </p>
                  </div>

                  {result.research?.summary && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                      <span className="text-sm font-semibold text-white">Research</span>
                      <p className="mt-1 text-sm leading-6 text-violet-50/65">
                        {result.research.summary}
                      </p>
                    </div>
                  )}
                </div>

                {result.spotUrl && readyCount === 1 && (
                  <Button asChild className="w-full rounded-lg bg-white text-violet-950 hover:bg-violet-50">
                    <Link href={result.spotUrl}>
                      Open spot
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline" className="w-full rounded-lg border-violet-200/20 bg-white/[0.04] text-violet-50 hover:bg-violet-400/10 hover:text-white">
                  <Link href={getSubmissionTrackerHref(result)}>
                    Track this submission
                    <Images className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button asChild variant="outline" className="w-full rounded-lg border-violet-200/20 bg-white/[0.04] text-violet-50 hover:bg-violet-400/10 hover:text-white">
                  <Link href="/spots/submissions">
                    <Images className="h-4 w-4" />
                    Track submissions
                  </Link>
                </Button>
                <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Ticket className="h-4 w-4 text-violet-300" />
                    25 tokens
                  </span>
                  <p className="mt-1 text-sm leading-6 text-violet-50/60">
                    Paste only the social post URL. Add email later if you want credits tied to you.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                  <span className="text-sm font-semibold text-white">Credit</span>
                  <p className="mt-1 text-sm leading-6 text-violet-50/60">
                    Public credit uses your credit name, masked email, or anonymous Localley contributor.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppBackground>
  );
}

export default function SubmitSpotPage() {
  if (!socialSpotSubmissionsEnabled) {
    return <SocialSubmissionsUnavailable />;
  }

  return <SubmitSpotForm />;
}
