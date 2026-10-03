/** Client opt-in only. The server independently checks its host, mode and verified owner. */
export function isPreviewNotificationSettings(
  location:
    | Pick<Location, "hostname" | "search">
    | undefined = typeof window === "undefined" ? undefined : window.location,
): boolean {
  return (
    location?.hostname === "localley-next-preview.nkopp.workers.dev" &&
    new URLSearchParams(location.search).get("data_candidate") === "d1"
  );
}

export function notificationPreferencesUrl(): string {
  return `/api/notifications/preferences${isPreviewNotificationSettings() ? "?data_candidate=d1" : ""}`;
}

/** Preserve list pagination while keeping all inbox actions on the same candidate. */
export function notificationInboxUrl(id?: string, page?: { limit: number; offset: number }): string {
  const path = `/api/notifications${id === undefined ? "" : `/${encodeURIComponent(id)}`}`;
  const params = new URLSearchParams();
  if (page) {
    params.set("limit", String(page.limit));
    params.set("offset", String(page.offset));
  }
  if (isPreviewNotificationSettings()) params.set("data_candidate", "d1");
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}
