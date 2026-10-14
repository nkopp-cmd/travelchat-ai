/** A mounted candidate control must never silently return to the normal save route. */
export function savedSpotCandidateUrl(spotId?: string): string | null {
  if (typeof window === "undefined"
    || window.location.hostname !== "localley-next-preview.nkopp.workers.dev"
    || new URLSearchParams(window.location.search).get("data_candidate") !== "d1"
    || (spotId !== undefined && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(spotId))) return null;
  return `/api/spots/save?data_candidate=d1${spotId ? `&spotId=${spotId}` : ""}`;
}
