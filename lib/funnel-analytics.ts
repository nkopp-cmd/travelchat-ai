import { analyticsOff, SPOT_EVENTS_URL } from "@/lib/spot-analytics";
import { parsePlannerSpotId } from "@/lib/trips/planner-draft";

// Planner/checkout funnel steps (shared/plans/localley-spot-cards-mobile.md). Sent at once with
// sendBeacon (the step usually precedes a navigation). Only the step and a coarse source go out.
export type BrowserFunnelStep = "planner_start" | "trip_generated" | "preview_view" | "checkout_start";
export type FunnelSource = "home" | "spots" | "pricing" | "preview" | "other" | "direct";

function pathSource(pathname: string): FunnelSource {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/spots")) return "spots";
  if (pathname.startsWith("/pricing")) return "pricing";
  return "other";
}

/**
 * Coarse source from the same-origin referrer path; never the URL itself. A valid `?spot=<id>` in the
 * current page search wins: "Add to trip" on a spot page is a client navigation, so document.referrer
 * still names the first page load (Google -> "other", typed -> "direct"). It maps to "spots" because the
 * D1 funnel_events_daily CHECK list has no "spot" value (a new value needs a production table rebuild).
 * `landing` (Push DH1) is the same-origin page this tab loaded first when the planner came by a client
 * navigation (header "Start planning" on home): document.referrer then names the page before home
 * (typed -> "direct"), so the landing page path is the better coarse source.
 */
export function funnelSource(referrer: string, origin: string, search = "", landing = ""): FunnelSource {
  if (search && parsePlannerSpotId(new URLSearchParams(search).get("spot"))) return "spots";
  if (landing) {
    try {
      const url = new URL(landing);
      if (url.origin === origin) return pathSource(url.pathname);
    } catch { /* fall back to the referrer */ }
  }
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin !== origin) return "other";
    return pathSource(url.pathname);
  } catch { return "other"; }
}

/** The first page load of this tab when the current page came by a client navigation, else "". */
export function clientNavLanding(): string {
  if (typeof window === "undefined") return "";
  try {
    const entry = performance.getEntriesByType("navigation")[0];
    if (!entry?.name) return "";
    return new URL(entry.name).pathname === location.pathname ? "" : entry.name;
  } catch { return ""; }
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
