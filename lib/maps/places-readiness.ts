/** One browser subscription for the existing Google Places script. No requests during SSR. */
export type PlacesStatus = "idle" | "loading" | "ready" | "unavailable";
let status: PlacesStatus = "idle";
const listeners = new Set<() => void>();

export function placesSnapshot(): PlacesStatus {
  if (typeof window !== "undefined" && window.google?.maps?.places) return "ready";
  return status;
}
export const placesServerSnapshot = (): PlacesStatus => "idle";

function publish(next: PlacesStatus) {
  status = next;
  for (const listener of listeners) listener();
}
function load() {
  if (placesSnapshot() === "ready" || status !== "idle") return;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) { publish("unavailable"); return; }
  const existing = Array.from(document.scripts).find(script => {
    try { const url = new URL(script.src); return url.hostname === "maps.googleapis.com" && url.pathname === "/maps/api/js"; }
    catch { return false; }
  });
  const script = existing || document.createElement("script");
  function finish() {
    clearTimeout(timeout);
    script.removeEventListener("load", finish);
    script.removeEventListener("error", finish);
    publish(window.google?.maps?.places ? "ready" : "unavailable");
  }
  // Keep this bounded listener until completion, even if its last input unmounts.
  // A later input can reuse the same pending script without a second network request.
  const timeout = setTimeout(finish, 15000);
  script.addEventListener("load", finish);
  script.addEventListener("error", finish);
  publish("loading");
  if (!existing) {
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }
}
export function subscribePlaces(listener: () => void) {
  listeners.add(listener);
  load();
  return () => { listeners.delete(listener); };
}
