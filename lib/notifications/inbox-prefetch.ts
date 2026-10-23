"use client";

import { notificationInboxUrl } from "@/lib/app-data/notification-candidate-url";

// The notification inbox lives in the lazily loaded navbar account chunk, so its first read
// used to wait for session -> chunk download -> render. The navbar (main bundle) starts that
// first page as soon as a verified owner is known; useNotifications takes it once.
export const INBOX_PAGE = 20;
export const inboxOwnerHeaders = (id: string) => ({ "X-Localley-Notification-Owner": id });

const prefetched = new Map<string, Promise<unknown | null>>();

export function prefetchInbox(owner: string) {
  if (prefetched.has(owner)) return;
  prefetched.set(owner, fetch(notificationInboxUrl(undefined, { limit: INBOX_PAGE, offset: 0 }), { headers: inboxOwnerHeaders(owner) })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null));
}

/** The prefetched first page for this owner (once), or undefined. */
export function takePrefetchedInbox(owner: string): Promise<unknown | null> | undefined {
  const page = prefetched.get(owner);
  prefetched.delete(owner);
  return page;
}
