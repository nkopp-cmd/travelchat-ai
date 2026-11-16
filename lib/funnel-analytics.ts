import { analyticsOff, SPOT_EVENTS_URL } from "@/lib/spot-analytics";
import { parsePlannerSpotId } from "@/lib/trips/planner-draft";

// Planner/checkout funnel steps (shared/plans/localley-spot-cards-mobile.md). Sent at once with
// sendBeacon (the step usually precedes a navigation). Only the step and a coarse source go out.
export type BrowserFunnelStep = "planner_start" | "trip_generated" | "preview_view" | "checkout_start";
export type FunnelSource = "home" | "spots" | "pricing" | "preview" | "other" | "direct";

/**
 * Coarse source from the same-origin referrer path; never the URL itself. A valid `?spot=<id>` in the
 * current page search wins: "Add to trip" on a spot page is a client navigation, so document.referrer
 * still names the first page load (Google -> "other", typed -> "direct"). It maps to "spots" because the
 * D1 funnel_events_daily CHECK list has no "spot" value (a new value needs a production table rebuild).
 */
export function funnelSource(referrer: string, origin: string, search = ""): FunnelSource {
  if (search && parsePlannerSpotId(new URLSearchParams(search).get("spot"))) return "spots";
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin !== origin) return "other";
    if (url.pathname === "/") return "home";
    if (url.pathname.startsWith("/spots")) return "spots";
    if (url.pathname.startsWith("/pricing")) return "pricing";
    return "other";
  } catch { return "other"; }
}

export function trackFunnelStep(step: BrowserFunnelStep, source: FunnelSource) {
  if (typeof window === "undefined") return;
  if (analyticsOff()) return;
  const body = JSON.stringify({ funnel: [{ step, source }] });
  try {
    if (!navigator.sendBeacon?.(SPOT_EVENTS_URL, new Blob([body], { type: "application/json" }))) {
      void fetch(SPOT_EVENTS_URL, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  } catch { /* Analytics must not block planning or checkout. */ }
}
