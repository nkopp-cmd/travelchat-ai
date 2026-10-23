import { SPOT_EVENTS_URL } from "@/lib/spot-analytics";

// Planner/checkout funnel steps (shared/plans/localley-spot-cards-mobile.md). Sent at once with
// sendBeacon (the step usually precedes a navigation). Only the step and a coarse source go out.
export type BrowserFunnelStep = "planner_start" | "trip_generated" | "preview_view" | "checkout_start";
export type FunnelSource = "home" | "spots" | "pricing" | "preview" | "other" | "direct";

/** Coarse source from the same-origin referrer path; never the URL itself. */
export function funnelSource(referrer: string, origin: string): FunnelSource {
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
  if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  const body = JSON.stringify({ funnel: [{ step, source }] });
  try {
    if (!navigator.sendBeacon?.(SPOT_EVENTS_URL, new Blob([body], { type: "application/json" }))) {
      void fetch(SPOT_EVENTS_URL, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  } catch { /* Analytics must not block planning or checkout. */ }
}
