export type SpotEvent = "card_view" | "save" | "add_to_trip" | "open_detail" | "directions";

/** Public catalog identity only. Never add account, query, location or URL data. */
export function trackSpotEvent(event: SpotEvent, spotId: string) {
  if (typeof window === "undefined" || !/^[a-zA-Z0-9_-]{1,128}$/.test(spotId)) return;
  if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  const detail = { event, spot_id: spotId };
  // No new SDK, storage, cookies or collector. Existing consumers may subscribe.
  try { window.dispatchEvent(new CustomEvent("localley:spot-event", { detail })); } catch { /* Analytics must not block an action. */ }
  try { window.gtag?.("event", event, { spot_id: spotId }); } catch { /* Preserve navigation and saves if the existing sink fails. */ }
}
