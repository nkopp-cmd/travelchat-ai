export type SpotEvent = "card_view" | "save" | "add_to_trip" | "open_detail" | "directions";

export const SPOT_EVENTS_URL = "/api/events/spots";
const MAX_PENDING = 25;
let pending: { event: SpotEvent; spot_id: string }[] = [];
let seenViews = new Set<string>();
let listening = false;

/** Sends the buffered events in one beacon (page hidden, page left, or buffer full). */
export function flushSpotEvents() {
  if (pending.length === 0) return;
  const body = JSON.stringify({ events: pending });
  pending = [];
  try {
    if (!navigator.sendBeacon?.(SPOT_EVENTS_URL, new Blob([body], { type: "application/json" }))) {
      void fetch(SPOT_EVENTS_URL, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  } catch { /* Analytics must not block an action. */ }
}

function queue(event: SpotEvent, spotId: string) {
  // One view per card per page; actions always count.
  if (event === "card_view") {
    if (seenViews.has(spotId)) return;
    seenViews.add(spotId);
  }
  if (!listening) {
    listening = true;
    addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSpotEvents(); });
    addEventListener("pagehide", flushSpotEvents);
  }
  pending.push({ event, spot_id: spotId });
  if (pending.length >= MAX_PENDING) flushSpotEvents();
}

/** Test hook: forget buffered events and seen views. */
export function resetSpotEventQueue() {
  pending = [];
  seenViews = new Set();
}

/** Public catalog identity only. Never add account, query, location or URL data. */
export function trackSpotEvent(event: SpotEvent, spotId: string) {
  if (typeof window === "undefined" || !/^[a-zA-Z0-9_-]{1,128}$/.test(spotId)) return;
  if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  const detail = { event, spot_id: spotId };
  // No SDK, storage or cookies: daily aggregate counts in D1 (app/api/events/spots), one beacon per page.
  try { window.dispatchEvent(new CustomEvent("localley:spot-event", { detail })); } catch { /* Analytics must not block an action. */ }
  try { queue(event, spotId); } catch { /* Analytics must not block an action. */ }
  try { window.gtag?.("event", event, { spot_id: spotId }); } catch { /* Preserve navigation and saves if the existing sink fails. */ }
}
