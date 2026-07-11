"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleX,
  Clock3,
  ImageIcon,
  Loader2,
  RotateCcw,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SocialMediaProcessingSummary } from "@/lib/social-spot-media-jobs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type SubmissionMediaState =
  | "queued"
  | "processing"
  | "retry_wait"
  | "succeeded"
  | "dead_letter";

export type SubmissionMediaKind = "image" | "video";

export type SubmissionMediaProgressItem = {
  id: string;
  state: SubmissionMediaState;
  kind: SubmissionMediaKind;
  ordinal: number;
  attempts: number;
  maxAttempts: number;
  publicErrorCode?: string | null;
};

export type SubmissionMediaProgressProps = {
  items: SubmissionMediaProgressItem[];
  submissionId?: string;
  processing?: SocialMediaProcessingSummary;
  className?: string;
  onRetry?: (item: SubmissionMediaProgressItem) => void;
};

type SubmissionMediaProgressProviderProps = {
  initialProgress: Record<string, SubmissionMediaProgressItem[]>;
  initialProcessing?: Record<string, SocialMediaProcessingSummary>;
  children: React.ReactNode;
};

type StatePresentation = {
  label: string;
  icon: LucideIcon;
  className: string;
  iconClassName?: string;
};

type PollingStatus = {
  state: "failed" | "retrying";
  lastSuccessfulAt: number;
};

const VISIBLE_ITEM_LIMIT = 4;
const EMPTY_PROCESSING: Record<string, SocialMediaProcessingSummary> = {};
const SubmissionMediaProgressContext = React.createContext<{
  progress: Record<string, SubmissionMediaProgressItem[]>;
  processing: Record<string, SocialMediaProcessingSummary>;
  polling: Record<string, PollingStatus>;
  retryPolling: (submissionId: string) => void;
} | null>(null);

const activeProcessingStates = new Set<SocialMediaProcessingSummary["state"]>([
  "coverage_retry",
  "coverage_processing",
  "queued",
  "processing",
  "succeeded",
  "finalizing",
]);

export function SubmissionMediaProgressProvider({
  initialProgress,
  initialProcessing = EMPTY_PROCESSING,
  children,
}: SubmissionMediaProgressProviderProps) {
  const [progress, setProgress] = React.useState(initialProgress);
  const [processing, setProcessing] = React.useState(initialProcessing);
  const [polling, setPolling] = React.useState<Record<string, PollingStatus>>({});
  const initialSnapshotAt = React.useRef(Date.now());
  const lastSuccessfulAt = React.useRef<Record<string, number>>({});
  const retryPollingRef = React.useRef<((submissionId: string) => void) | null>(null);
  React.useEffect(() => setProgress(initialProgress), [initialProgress]);
  React.useEffect(() => setProcessing(initialProcessing), [initialProcessing]);
  const activeIds = Array.from(new Set([
    ...Object.entries(progress)
      .filter(([, items]) => items.some((item) =>
        ["queued", "processing", "retry_wait"].includes(item.state),
      ))
      .map(([submissionId]) => submissionId),
    ...Object.entries(processing)
      .filter(([, summary]) => activeProcessingStates.has(summary.state))
      .map(([submissionId]) => submissionId),
  ])).slice(0, 20);
  const activeKey = activeIds.join(",");

  React.useEffect(() => {
    if (!activeKey) {
      retryPollingRef.current = null;
      return;
    }
    let cancelled = false;
    let inFlight: Promise<void> | null = null;
    const requestedIds = activeKey.split(",");
    const refresh = () => {
      if (inFlight) return inFlight;

      const request = (async () => {
        try {
          const response = await fetch(
            `/api/spots/social-submissions/media-status?ids=${encodeURIComponent(activeKey)}`,
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error("Media status refresh failed");
          const payload = await response.json() as {
            submissions?: Record<string, SubmissionMediaProgressItem[]>;
            processing?: Record<string, SocialMediaProcessingSummary>;
          };
          if (cancelled) return;

          const successfulAt = Date.now();
          requestedIds.forEach((submissionId) => {
            lastSuccessfulAt.current[submissionId] = successfulAt;
          });
          setPolling((current) => {
            const next = { ...current };
            requestedIds.forEach((submissionId) => delete next[submissionId]);
            return next;
          });
          if (payload.submissions) {
            setProgress((current) => ({ ...current, ...payload.submissions }));
          }
          if (payload.processing) {
            setProcessing((current) => ({ ...current, ...payload.processing }));
          }
        } catch {
          if (cancelled) return;
          setPolling((current) => {
            const next = { ...current };
            requestedIds.forEach((submissionId) => {
              next[submissionId] = {
                state: "failed",
                lastSuccessfulAt:
                  current[submissionId]?.lastSuccessfulAt
                  ?? lastSuccessfulAt.current[submissionId]
                  ?? initialSnapshotAt.current,
              };
            });
            return next;
          });
        } finally {
          inFlight = null;
        }
      })();
      inFlight = request;
      return request;
    };
    retryPollingRef.current = (submissionId) => {
      setPolling((current) => {
        const status = current[submissionId];
        if (!status) return current;
        return {
          ...current,
          [submissionId]: { ...status, state: "retrying" },
        };
      });
      void refresh();
    };
    const interval = window.setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      retryPollingRef.current = null;
      window.clearInterval(interval);
    };
  }, [activeKey]);

  const retryPolling = React.useCallback((submissionId: string) => {
    retryPollingRef.current?.(submissionId);
  }, []);

  return (
    <SubmissionMediaProgressContext.Provider
      value={{ progress, processing, polling, retryPolling }}
    >
      {children}
    </SubmissionMediaProgressContext.Provider>
  );
}

const statePresentations: Record<SubmissionMediaState, StatePresentation> = {
  queued: {
    label: "Queued",
    icon: Clock3,
    className:
      "bg-slate-100 text-slate-800 ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    className:
      "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-700",
    iconClassName: "motion-safe:animate-spin",
  },
  retry_wait: {
    label: "Waiting to retry",
    icon: RotateCcw,
    className:
      "bg-amber-100 text-amber-950 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700",
  },
  succeeded: {
    label: "Complete",
    icon: CheckCircle2,
    className:
      "bg-emerald-100 text-emerald-950 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-700",
  },
  dead_letter: {
    label: "Couldn't process",
    icon: CircleX,
    className:
      "bg-rose-100 text-rose-950 ring-rose-300 dark:bg-rose-950 dark:text-rose-100 dark:ring-rose-700",
  },
};

const kindPresentations: Record<
  SubmissionMediaKind,
  { label: string; icon: LucideIcon }
> = {
  image: { label: "Image", icon: ImageIcon },
  video: { label: "Video", icon: Video },
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function PollingUpdateStatus({
  status,
  onRetry,
}: {
  status: PollingStatus;
  onRetry: () => void;
}) {
  const retrying = status.state === "retrying";
  const lastSuccessfulUpdate = React.useMemo(
    () => new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(status.lastSuccessfulAt),
    [status.lastSuccessfulAt],
  );

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {retrying ? "Checking for updates" : "Live updates are taking longer than usual"}
        </p>
        <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">
          Your latest results are still shown. Last successful update: {lastSuccessfulUpdate}.
          {!retrying ? " We’ll keep trying automatically." : null}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 shrink-0"
        disabled={retrying}
        onClick={onRetry}
      >
        <RotateCcw
          aria-hidden="true"
          className={cn("size-4", retrying && "motion-safe:animate-spin")}
        />
        {retrying ? "Trying again" : "Try again now"}
      </Button>
    </div>
  );
}

function MediaItemRow({
  item,
  onRetry,
}: {
  item: SubmissionMediaProgressItem;
  onRetry?: SubmissionMediaProgressProps["onRetry"];
}) {
  const state = statePresentations[item.state];
  const kind = kindPresentations[item.kind];
  const StateIcon = state.icon;
  const KindIcon = kind.icon;
  const mediaLabel = `${kind.label} ${item.ordinal}`;
  const canRetry = item.state === "dead_letter" && Boolean(onRetry);

  return (
    <li
      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border bg-card px-3 py-2.5 text-card-foreground last:border-b-0"
      data-state={item.state}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
      >
        <KindIcon className="size-4" />
      </span>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-foreground">{mediaLabel}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
              state.className,
            )}
          >
            <StateIcon
              aria-hidden="true"
              className={cn("size-3.5", state.iconClassName)}
            />
            {state.label}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          Attempts {item.attempts} of {item.maxAttempts}
        </p>
        {item.publicErrorCode ? (
          <p className="mt-1 break-all text-xs font-semibold text-rose-800 dark:text-rose-200">
            Error <code className="font-mono">{item.publicErrorCode}</code>
          </p>
        ) : null}
      </div>

      {canRetry ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`Retry ${mediaLabel.toLowerCase()}`}
          title={`Retry ${mediaLabel.toLowerCase()}`}
          onClick={() => onRetry?.(item)}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}

export function SubmissionMediaProgress({
  items,
  submissionId,
  processing,
  className,
  onRetry,
}: SubmissionMediaProgressProps) {
  const groupedProgress = React.useContext(SubmissionMediaProgressContext);
  const displayedItems = submissionId && groupedProgress?.progress[submissionId]
    ? groupedProgress.progress[submissionId]
    : items;
  const displayedProcessing = submissionId && groupedProgress?.processing[submissionId]
    ? groupedProgress.processing[submissionId]
    : processing;
  const pollingStatus = submissionId
    ? groupedProgress?.polling[submissionId]
    : undefined;
  const headingId = React.useId();
  const summaryId = React.useId();
  const total = displayedItems.length;
  const counts = displayedItems.reduce<Record<SubmissionMediaState, number>>(
    (result, item) => {
      result[item.state] += 1;
      return result;
    },
    {
      queued: 0,
      processing: 0,
      retry_wait: 0,
      succeeded: 0,
      dead_letter: 0,
    },
  );
  const finished = counts.succeeded + counts.dead_letter;
  const remaining = total - finished;
  const progress = total > 0 ? Math.round((finished / total) * 100) : 0;
  const visibleItems = displayedItems.slice(0, VISIBLE_ITEM_LIMIT);
  const additionalItems = displayedItems.slice(VISIBLE_ITEM_LIMIT);
  const stateSummary = [
    counts.succeeded > 0
      ? pluralize(counts.succeeded, "succeeded", "succeeded")
      : null,
    counts.dead_letter > 0
      ? pluralize(counts.dead_letter, "failed", "failed")
      : null,
    counts.processing > 0
      ? pluralize(counts.processing, "processing", "processing")
      : null,
    counts.retry_wait > 0
      ? `${counts.retry_wait} waiting to retry`
      : null,
    counts.queued > 0
      ? pluralize(counts.queued, "queued", "queued")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const progressValueText = `${finished} of ${total} media items finished; ${counts.succeeded} succeeded; ${counts.dead_letter} failed; ${remaining} remaining`;
  const parentStatus = (() => {
    switch (displayedProcessing?.state) {
      case "not_started":
        return {
          label: "Awaiting full media check",
          helper: "This older submission is waiting for an operator-reviewed media check.",
        };
      case "coverage_retry":
      case "coverage_processing":
        return {
          label: "Retrieving the full post",
          helper: "Localley is finding every image and video before place verification begins.",
        };
      case "queued":
      case "processing":
        return {
          label: total > 0 ? `${finished} of ${total} finished` : "Preparing media analysis",
          helper: "Every discovered media item is checked independently.",
        };
      case "succeeded":
      case "finalizing":
        return {
          label: "Verifying discovered places",
          helper: displayedProcessing.finalizationAttempts > 0
            ? `Place verification attempt ${displayedProcessing.finalizationAttempts} of 5.`
            : "Media analysis is complete and Localley is localizing each distinct place.",
        };
      case "review_required":
      case "dead_letter":
        return {
          label: "Full media check needs review",
          helper: "Automatic processing stopped safely without publishing incomplete place data.",
        };
      case "completed":
        return {
          label: total > 0 ? `${finished} of ${total} finished` : "Media check complete",
          helper: "Complete media evidence was included in place verification.",
        };
      default:
        return null;
    }
  })();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "overflow-hidden rounded-md border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div className="border-b border-border px-3 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 id={headingId} className="text-sm font-semibold text-foreground">
            Media processing
          </h3>
          <p
            id={summaryId}
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            {total > 0 ? `${finished} of ${total} finished` : parentStatus?.label || "No media to process"}
            {stateSummary ? <span className="sr-only">. {stateSummary}</span> : null}
          </p>
        </div>

        {total > 0 ? (
          <>
            <Progress
              value={progress}
              aria-label="Media processing progress"
              aria-describedby={summaryId}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-valuetext={progressValueText}
              className="mt-2 h-2 bg-slate-200 dark:bg-slate-700 [&_[data-slot=progress-indicator]]:bg-violet-600 dark:[&_[data-slot=progress-indicator]]:bg-violet-400"
            />
            <p className="mt-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              {stateSummary}
            </p>
          </>
        ) : parentStatus ? (
          <p className="mt-2 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">
            {parentStatus.helper}
          </p>
        ) : null}

        {pollingStatus && submissionId ? (
          <PollingUpdateStatus
            status={pollingStatus}
            onRetry={() => groupedProgress?.retryPolling(submissionId)}
          />
        ) : null}
      </div>

      {visibleItems.length > 0 ? (
        <ol aria-label="Media items" className="divide-y-0">
          {visibleItems.map((item) => (
            <MediaItemRow key={item.id} item={item} onRetry={onRetry} />
          ))}
        </ol>
      ) : null}

      {additionalItems.length > 0 ? (
        <details className="group border-t border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
            <span>
              Show {pluralize(additionalItems.length, "more media item")}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <ol
            start={VISIBLE_ITEM_LIMIT + 1}
            aria-label="Additional media items"
            className="border-t border-border"
          >
            {additionalItems.map((item) => (
              <MediaItemRow key={item.id} item={item} onRetry={onRetry} />
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
