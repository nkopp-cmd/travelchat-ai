/** A lost opt-in must never send a guide application to the source route. */
export function previewGuideApplicationUrl(
  location: Pick<Location, "hostname" | "search"> | undefined = typeof window === "undefined" ? undefined : window.location,
): string | null {
  return location?.hostname === "localley-next-preview.nkopp.workers.dev"
    && new URLSearchParams(location.search).get("data_candidate") === "d1"
    ? "/api/connect/onboard?data_candidate=d1" : null;
}
