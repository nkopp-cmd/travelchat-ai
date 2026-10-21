"use client";

import { useEffect, useMemo, useState } from "react";
import { useWizard } from "./wizard-context";
import { Loader2, Route, AlertTriangle, Train, Ship, Plane, Bus, Car } from "@/components/ui/icons";
import { buildCorridorRequest, corridorSelectionError } from "@/lib/trips/wizard-corridor";

type PreviewStop = {
  position: number;
  destinationSlug: string;
  nights: number;
  dayIndexes: number[];
};

type PreviewTransfer = {
  position: number;
  fromSlug: string;
  toSlug: string;
  mode: string;
  durationMinutes: { min: number; max: number };
  costBand: string;
};

type PreviewResponse = {
  ok: boolean;
  preview?: {
    stops: PreviewStop[];
    transfers: PreviewTransfer[];
    warnings: string[];
  };
  error?: { code?: string; message?: string };
};

function formatDuration(minutes: { min: number; max: number }): string {
  const toHours = (value: number) => {
    const hours = value / 60;
    return hours >= 1 ? `${Number(hours.toFixed(1))}h` : `${value}m`;
  };
  return `${toHours(minutes.min)}–${toHours(minutes.max)}`;
}

function TransferIcon({ mode }: { mode: string }) {
  const className = "h-3.5 w-3.5 shrink-0 text-primary";
  if (mode === "train") return <Train className={className} />;
  if (mode === "flight") return <Plane className={className} />;
  if (mode === "ferry") return <Ship className={className} />;
  if (mode === "bus") return <Bus className={className} />;
  return <Car className={className} />;
}

export function RoutePreview() {
  const { data } = useWizard();
  const [resolved, setResolved] = useState<{ key: string; response: PreviewResponse } | null>(null);

  const requestBody = useMemo(
    () =>
      buildCorridorRequest({
        destinationSlugs: data.citySlugs,
        totalDays: data.days,
        budget: data.budget,
        pace: data.pace,
        groupType: data.groupType,
        interests: data.interests,
      }),
    [data.citySlugs, data.days, data.budget, data.pace, data.groupType, data.interests],
  );
  const requestKey = JSON.stringify(requestBody);

  const selectionError = corridorSelectionError(data.citySlugs.length, data.days);

  const result = !selectionError && resolved?.key === requestKey ? resolved.response : null;
  const isLoading = !selectionError && result === null;

  useEffect(() => {
    if (selectionError) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/v2/trips/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestKey,
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json()) as PreviewResponse;
          if (!cancelled) setResolved({ key: requestKey, response: body });
        })
        .catch(() => {
          if (!cancelled) setResolved({ key: requestKey, response: { ok: false, error: { message: "Could not load the route preview." } } });
        });
    }, 400);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [requestKey, selectionError]);

  if (data.citySlugs.length < 2) return null;

  return (
    <div className="rounded-xl bg-primary/10 p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <Route className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Your optimized route</span>
      </div>

      {selectionError && (
        <div className="flex items-start gap-2 text-xs text-[rgb(var(--ll-warning))]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{selectionError}</span>
        </div>
      )}

      {!selectionError && isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Optimizing route…
        </div>
      )}

      {!selectionError && !isLoading && result?.ok && result.preview && (
        <div className="space-y-1.5">
          {result.preview.stops.map((stop, index) => {
            const transfer = result.preview!.transfers.find((item) => item.position === index);
            const name = data.cityNameBySlug[stop.destinationSlug] || stop.destinationSlug;
            return (
              <div key={stop.destinationSlug}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">{name}</span>
                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                    {stop.nights} {stop.nights === 1 ? "night" : "nights"}
                  </span>
                </div>
                {transfer && (
                  <div className="my-1 flex items-center gap-2 pl-3 text-xs text-muted-foreground">
                    <TransferIcon mode={transfer.mode} />
                    <span>
                      {data.cityNameBySlug[transfer.fromSlug] || transfer.fromSlug} →{" "}
                      {data.cityNameBySlug[transfer.toSlug] || transfer.toSlug} · {transfer.mode} ·{" "}
                      {formatDuration(transfer.durationMinutes)} · {transfer.costBand}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {result.preview.warnings.includes("TRANSFER_DAY_FULL") && (
            <div className="flex items-start gap-2 pt-1 text-xs text-[rgb(var(--ll-warning))]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>One travel day is fully consumed by the transfer — no activities that day.</span>
            </div>
          )}
        </div>
      )}

      {!selectionError && !isLoading && result && !result.ok && (
        <div className="flex items-start gap-2 text-xs text-[rgb(var(--ll-warning))]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{result.error?.message || "This route is not available yet. Try different cities."}</span>
        </div>
      )}
    </div>
  );
}
