"use client";

import { useSyncExternalStore } from "react";
import {
  generatedPreviewServerSnapshot,
  generatedPreviewSnapshot,
  parseGeneratedPreview,
  subscribeGeneratedPreview,
  type GeneratedPreview,
} from "@/lib/trips/generated-preview";

/** "Tokyo like a local · Tokyo, 3 days" for the browser-kept free plan, or null. */
export function keptTripLabel(preview: GeneratedPreview | null): { title: string; detail: string } | null {
  if (!preview) return null;
  const { title, city, days } = preview.itinerary;
  return { title, detail: `${city}, ${days} ${days === 1 ? "day" : "days"}` };
}

/**
 * Push BM2: the Save gate of the free plan sends the visitor to /sign-up. Name the trip they are saving, read from
 * the copy this browser already keeps (no request). The server HTML renders nothing, so the page stays the same for
 * every visitor and the line appears after hydration.
 */
export function KeptTripLine() {
  const raw = useSyncExternalStore(subscribeGeneratedPreview, generatedPreviewSnapshot, generatedPreviewServerSnapshot);
  const trip = keptTripLabel(parseGeneratedPreview(raw));
  if (!trip) return null;
  return (
    <p data-testid="kept-trip" className="mb-6 rounded-xl bg-muted/60 px-4 py-3 text-sm text-foreground">
      Saving <strong className="font-semibold">{trip.title}</strong> <span className="text-muted-foreground">({trip.detail})</span>
    </p>
  );
}
