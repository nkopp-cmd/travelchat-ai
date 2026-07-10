"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const BACKFILL_ENDPOINT = "/api/admin/spots/social-submissions/backfill";

type EligibleSubmission = {
  id: string;
  platform: string;
  status: string;
  name: string | null;
  hasSpot: boolean;
  createdAt: string;
};

type ReviewPlan = {
  dryRun: true;
  eligible: EligibleSubmission[];
  planToken: string | null;
  cutoff: string;
  expiresAt?: string;
  provider: { instagramConfigured: boolean };
};

type ExecutionResult = {
  dryRun: false;
  requestKey: string;
  claimed: string[];
  skipped: string[];
  worker: {
    started: boolean;
    status: number | null;
    summary: Record<string, unknown> | null;
  };
};

type SocialSubmissionRecoveryProps = {
  instagramConfigured: boolean;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCountdown(expiresAt: string | undefined, now: number): string | null {
  if (!expiresAt) return null;
  const remainingSeconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1_000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function readApiError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error?.message === "string") return body.error.message;
  if (typeof body?.error === "string") return body.error;
  return "The recovery request could not be completed.";
}

function createIdempotencyKey() {
  const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `legacy-ui-${randomId}`;
}

export function SocialSubmissionRecovery({
  instagramConfigured,
}: SocialSubmissionRecoveryProps) {
  const [limit, setLimit] = useState(3);
  const [includeInstagram, setIncludeInstagram] = useState(false);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState<"review" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!plan?.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [plan?.expiresAt]);

  const expiresAt = plan?.expiresAt ? Date.parse(plan.expiresAt) : null;
  const planExpired = Boolean(expiresAt && expiresAt <= now);
  const countdown = formatCountdown(plan?.expiresAt, now);
  const selectedCount = plan?.eligible.length || 0;
  const workerSummary = execution?.worker.summary;
  const workerProcessed = useMemo(() => {
    if (!workerSummary) return null;
    const values = ["succeeded", "retried", "finalized", "deadLettered"]
      .map((key) => Number(workerSummary[key] || 0));
    return values.reduce((total, value) => total + value, 0);
  }, [workerSummary]);

  function invalidatePlan() {
    setPlan(null);
    setExecution(null);
    setError(null);
  }

  async function reviewPlan() {
    setLoading("review");
    setError(null);
    setExecution(null);
    try {
      const response = await fetch(BACKFILL_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dryRun: true,
          limit,
          includeInstagram: instagramConfigured && includeInstagram,
          includeResolved,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setPlan(await response.json() as ReviewPlan);
      setNow(Date.now());
    } catch (reviewError) {
      setPlan(null);
      setError(reviewError instanceof Error ? reviewError.message : "Could not review legacy posts.");
    } finally {
      setLoading(null);
    }
  }

  async function executePlan() {
    if (!plan?.planToken || planExpired) {
      setError("This review plan expired. Refresh it before queueing posts.");
      return;
    }
    setLoading("execute");
    setError(null);
    try {
      const response = await fetch(BACKFILL_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": createIdempotencyKey(),
        },
        body: JSON.stringify({ dryRun: false, planToken: plan.planToken }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setExecution(await response.json() as ExecutionResult);
      setPlan(null);
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : "Could not queue legacy posts.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-8">
      <nav aria-label="Admin navigation" className="mb-5 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" className="border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.09]">
          <Link href="/spots/submissions">
            <ArrowLeft aria-hidden="true" />
            Tracker
          </Link>
        </Button>
        <Button asChild variant="ghost" className="text-violet-100 hover:bg-violet-400/10 hover:text-white">
          <Link href="/admin/spots/quality">Spot quality</Link>
        </Button>
      </nav>

      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-200">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Admin review
        </div>
        <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">
          Community recovery queue
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
          Review exact legacy posts before starting complete media extraction and place verification.
        </p>
      </header>

      <section aria-labelledby="recovery-controls" className="grid gap-5 border-b border-white/10 py-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 id="recovery-controls" className="text-lg font-semibold text-white">Review scope</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-2 text-sm font-medium text-zinc-200">
              Posts per run
              <select
                aria-label="Posts per run"
                value={limit}
                onChange={(event) => {
                  setLimit(Number(event.target.value));
                  invalidatePlan();
                }}
                className="h-11 rounded-md border border-white/10 bg-[#17131f] px-3 text-white outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-300/25"
              >
                <option value={1}>1 post</option>
                <option value={2}>2 posts</option>
                <option value={3}>3 posts</option>
              </select>
            </label>

            <div className="flex min-h-20 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
              <div>
                <p className="text-sm font-medium text-zinc-100">Instagram</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {instagramConfigured ? "Include Instagram posts" : "Provider unavailable"}
                </p>
              </div>
              <Switch
                aria-label="Include Instagram posts"
                checked={includeInstagram}
                disabled={!instagramConfigured}
                onCheckedChange={(checked) => {
                  setIncludeInstagram(checked);
                  invalidatePlan();
                }}
              />
            </div>

            <div className="flex min-h-20 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
              <div>
                <p className="text-sm font-medium text-zinc-100">Existing spots</p>
                <p className="mt-1 text-xs text-zinc-400">Allow enrichment</p>
              </div>
              <Switch
                aria-label="Include submissions with existing spots"
                checked={includeResolved}
                onCheckedChange={(checked) => {
                  setIncludeResolved(checked);
                  invalidatePlan();
                }}
              />
            </div>
          </div>
          {includeResolved && (
            <div role="status" className="mt-3 flex gap-2 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Existing community spots can receive new evidence and photos.
            </div>
          )}
        </div>

        <Button
          onClick={reviewPlan}
          disabled={Boolean(loading)}
          className="h-11 w-full bg-white px-5 text-zinc-950 hover:bg-zinc-100 lg:w-auto"
        >
          {loading === "review" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          Review eligible posts
        </Button>
      </section>

      <section aria-labelledby="review-results" className="py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="review-results" className="text-lg font-semibold text-white">Reviewed posts</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {plan ? `${selectedCount} eligible` : "No active review plan"}
            </p>
          </div>
          {plan?.expiresAt && (
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Clock3 className="size-4" aria-hidden="true" />
              {planExpired ? "Plan expired" : `Expires in ${countdown}`}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-md border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {execution && (
          <div role="status" aria-live="polite" className="mt-4 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-50">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">
                  {execution.claimed.length} {execution.claimed.length === 1 ? "post" : "posts"} admitted
                </p>
                <p className="mt-1 text-sm text-emerald-100/75">
                  {execution.worker.started
                    ? `Worker completed the current batch${workerProcessed === null ? "" : ` with ${workerProcessed} state updates`}.`
                    : "The posts are queued for the next bounded worker run."}
                </p>
                <Link href="/spots/submissions" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">
                  Open tracker
                  <ExternalLink className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {plan && plan.eligible.length === 0 && (
          <div className="mt-4 rounded-md border border-white/10 bg-white/[0.035] p-5 text-sm text-zinc-300">
            No legacy posts match this scope.
          </div>
        )}

        {plan && plan.eligible.length > 0 && (
          <>
            <div className="mt-4 grid gap-3" role="list" aria-label="Eligible legacy posts">
              {plan.eligible.map((submission) => (
                <article key={submission.id} role="listitem" className="grid gap-3 rounded-md border border-white/10 bg-[#14101c] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-zinc-400">
                      <span>{submission.platform}</span>
                      <span aria-hidden="true">·</span>
                      <span>{submission.status.replaceAll("_", " ")}</span>
                      {submission.hasSpot && <span className="rounded-md bg-amber-300/10 px-2 py-1 text-amber-100">Existing spot</span>}
                    </div>
                    <h3 className="mt-2 truncate font-semibold text-white">
                      {submission.name || "Unnamed social post"}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">{formatDate(submission.createdAt)}</p>
                  </div>
                  <Link
                    href={`/spots/submissions?submission=${encodeURIComponent(submission.id)}`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]"
                  >
                    Inspect
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>

            <div className="sticky bottom-20 z-20 mt-5 rounded-md border border-violet-300/20 bg-[#15101f]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur md:bottom-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-zinc-300">
                  <span className="font-semibold text-white">{selectedCount} reviewed</span>
                  <span className="ml-2">Exact IDs are locked in this plan.</span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={!plan.planToken || planExpired || Boolean(loading)}
                      className="h-11 bg-violet-500 text-white hover:bg-violet-400"
                    >
                      {loading === "execute" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
                      Queue and run {selectedCount} {selectedCount === 1 ? "post" : "posts"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-white/10 bg-[#15111d] text-white">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Start {selectedCount} reviewed {selectedCount === 1 ? "post" : "posts"}?</AlertDialogTitle>
                      <AlertDialogDescription className="leading-6 text-zinc-300">
                        Complete media extraction and place research starts immediately. Existing spots are enriched only when that option is enabled.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-white/10 bg-transparent text-white hover:bg-white/[0.08] hover:text-white">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={executePlan}
                        className="bg-violet-500 text-white hover:bg-violet-400"
                      >
                        Start recovery
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </>
        )}

        {!plan && !execution && !error && (
          <div className="mt-4 flex min-h-36 items-center justify-center rounded-md border border-dashed border-white/10 text-center text-sm text-zinc-500">
            <div>
              <RefreshCw className="mx-auto mb-2 size-5" aria-hidden="true" />
              Run a review to load exact legacy posts.
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
