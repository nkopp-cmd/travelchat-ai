"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Instagram,
  Loader2,
  Mail,
  Sparkles,
  Ticket,
  User,
  Video,
} from "lucide-react";
import { AppBackground } from "@/components/layout/app-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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
  };
  spotUrl?: string | null;
  error?: {
    message: string;
  };
};

const statusLabel: Record<NonNullable<SubmissionResponse["submission"]>["status"], string> = {
  spot_created: "Spot added",
  spot_reused: "Matched existing spot",
  needs_review: "Queued for review",
  research_pending: "Research queued",
};

const socialSpotSubmissionsEnabled =
  process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED === "true";

function extractSocialUrl(value: string | null): string {
  if (!value) return "";

  const candidates = value.match(/https?:\/\/[^\s"'<>]+/gi) || [value];

  return candidates.find((candidate) => {
    try {
      const host = new URL(candidate.trim()).hostname.toLowerCase();
      return host.endsWith("instagram.com") || host.endsWith("tiktok.com");
    } catch {
      return false;
    }
  }) || "";
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

        <section className="rounded-lg border border-violet-200/15 bg-[#100b1c]/86 p-5 shadow-lg shadow-violet-950/20 backdrop-blur-xl sm:p-7">
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
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl =
      extractSocialUrl(params.get("url")) ||
      extractSocialUrl(params.get("text")) ||
      extractSocialUrl(params.get("title"));

    if (sharedUrl) setUrl(sharedUrl);
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

      setResult(body);
      toast({
        title: body.duplicate ? "Already submitted" : "Submission saved",
        description: body.contributor
          ? `${body.contributor.tokensAwarded} tokens awarded. Balance: ${body.contributor.totalTokens}.`
          : undefined,
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
          <section className="rounded-lg border border-violet-200/15 bg-[#100b1c]/86 p-4 shadow-lg shadow-violet-950/20 backdrop-blur-xl sm:p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-400/10 px-3 py-1 text-sm font-medium text-violet-100">
                  <Sparkles className="h-4 w-4" />
                  Community discovery
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
                  Drop a video link
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-violet-50/65">
                  Paste a TikTok or Instagram spot video. Localley will research the place, dedupe it, and queue the spot.
                </p>
              </div>
              <div className="flex gap-2">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-violet-100">
                  <Instagram className="h-5 w-5" />
                </span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-violet-100">
                  <Video className="h-5 w-5" />
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="social-url" className="text-violet-50">
                  TikTok or Instagram video URL
                </Label>
                <Input
                  id="social-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  required
                  inputMode="url"
                  className="border-violet-200/15 bg-white/[0.06] text-white placeholder:text-violet-50/35"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-violet-50">
                    Email <span className="text-violet-50/45">(optional)</span>
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-200/60" />
                    <Input
                      id="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="For credits and history"
                      type="email"
                      className="border-violet-200/15 bg-white/[0.06] pl-9 text-white placeholder:text-violet-50/35"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contributor-name" className="text-violet-50">
                    Credit name <span className="text-violet-50/45">(optional)</span>
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-200/60" />
                    <Input
                      id="contributor-name"
                      value={contributorName}
                      onChange={(event) => setContributorName(event.target.value)}
                      placeholder="Optional"
                      className="border-violet-200/15 bg-white/[0.06] pl-9 text-white placeholder:text-violet-50/35"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-violet-50">
                    City hint <span className="text-violet-50/45">(optional)</span>
                  </Label>
                  <Input
                    id="city"
                    value={cityHint}
                    onChange={(event) => setCityHint(event.target.value)}
                    placeholder="Seoul"
                    className="border-violet-200/15 bg-white/[0.06] text-white placeholder:text-violet-50/35"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-violet-50">
                    Notes <span className="text-violet-50/45">(optional)</span>
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="What should we know about this place?"
                    className="min-h-24 border-violet-200/15 bg-white/[0.06] text-white placeholder:text-violet-50/35"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full rounded-lg bg-violet-500 text-base font-bold text-white shadow-lg shadow-violet-500/25 hover:bg-violet-400 sm:w-auto"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Submit video
              </Button>
            </form>
          </section>

          <aside className="rounded-lg border border-violet-200/15 bg-[#100b1c]/86 p-4 shadow-lg shadow-violet-950/20 backdrop-blur-xl sm:p-5">
            {result ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-300" />
                  <div>
                    <p className="font-semibold text-white">
                      {result.submission ? statusLabel[result.submission.status] : "Submission saved"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-violet-50/60">
                      Credited to {result.contributor?.creditName || "Localley contributor"}.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2">
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

                {result.spotUrl && (
                  <Button asChild className="w-full rounded-lg bg-white text-violet-950 hover:bg-violet-50">
                    <Link href={result.spotUrl}>
                      Open spot
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Ticket className="h-4 w-4 text-violet-300" />
                    25 tokens
                  </span>
                  <p className="mt-1 text-sm leading-6 text-violet-50/60">
                    Paste only the video URL. Add email later if you want credits tied to you.
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
