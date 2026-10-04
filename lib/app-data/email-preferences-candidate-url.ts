/** Lost opt-in never routes a preview consent write to the source endpoint. */
export function previewEmailPreferencesUrl(
  location: Pick<Location, "hostname" | "search"> | undefined = typeof window === "undefined" ? undefined : window.location,
): string | null {
  return location?.hostname === "localley-next-preview.nkopp.workers.dev"
    && new URLSearchParams(location.search).get("data_candidate") === "d1"
    ? "/api/user/email-preferences?data_candidate=d1" : null;
}
