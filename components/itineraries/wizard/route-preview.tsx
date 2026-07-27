"use client";

import { useEffect, useMemo, useState } from "react";
import { useWizard } from "./wizard-context";
import { Loader2, Route, AlertTriangle, Train, Ship, Plane, Bus, Car } from "lucide-react";
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
  const className = "h-3.5 w-3.5 shrink-0 text-violet-300";
  if (mode === "train") return <Train className={className} />;
  if (mode === "flight") return <Plane className={className} />;
  if (mode === "ferry") return <Ship className={className} />;
  if (mode === "bus") return <Bus className={className} />;
  return <Car className={className} />;
}

export function RoutePreview() {
  const { data } = useWizard();
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
  const requestKey = JSON.stringify({
    destinations: requestBody.destinations,
    totalDays: requestBody.totalDays,
  });

  const selectionError = corridorSelectionError(data.citySlugs.length, data.days);

  useEffect(() => {
    if (selectionError) {
      setResult(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = setTimeout(() => {
      fetch("/api/v2/trips/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      })
        .then(async (response) => {
          if (response.status === 429) {
            if (!cancelled) {
              setResult({ ok: false, error: { code: "rate_limited", message: "Too many changes — wait a moment and the route will refresh." } });
            }
            return;
          }
          const body = (await response.json()) as PreviewResponse;
          if (!cancelled) setResult(body);
        })
        .catch(() => {
          if (!cancelled) setResult({ ok: false, error: { message: "Could not load the route preview." } });
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [requestKey, selectionError]);

  if (data.citySlugs.length < 2) return null;

  return (
    <div className="rounded-xl border border-violet-300/20 bg-violet-500/5 p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <Route className="h-4 w-4 text-violet-400" />
        <span className="text-sm font-semibold text-white">Your optimized route</span>
      </div>

      {selectionError && (
        <div className="flex items-start gap-2 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{selectionError}</span>
        </div>
      )}

      {!selectionError && isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
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
                  <span className="min-w-0 truncate text-sm font-medium text-white">{name}</span>
                  <span className="shrink-0 rounded-full bg-violet-600/80 px-2 py-0.5 text-[10px] font-bold text-white">
                    {stop.nights} {stop.nights === 1 ? "night" : "nights"}
                  </span>
                </div>
                {transfer && (
                  <div className="my-1 flex items-center gap-2 pl-3 text-[11px] text-gray-400">
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
            <div className="flex items-start gap-2 pt-1 text-[11px] text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>One travel day is fully consumed by the transfer — no activities that day.</span>
            </div>
          )}
        </div>
      )}

      {!selectionError && !isLoading && result && !result.ok && (
        <div className="flex items-start gap-2 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{result.error?.message || "This route is not available yet. Try different cities."}</span>
        </div>
      )}
    </div>
  );
}
