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
