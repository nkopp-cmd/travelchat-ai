import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({ user: { id: "owner-1", emailVerified: true } as { id: string; emailVerified: boolean } | null }));
vi.mock("@/lib/auth/client", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: Boolean(auth.user), user: auth.user }) }));

import { useNotifications } from "@/hooks/use-notifications";
import { prefetchInbox, takePrefetchedInbox } from "@/lib/notifications/inbox-prefetch";

const page = (title: string) => ({ notifications: [{ id: title, title }], unreadCount: 1, hasMore: false });

afterEach(() => { vi.unstubAllGlobals(); takePrefetchedInbox("owner-1"); takePrefetchedInbox("owner-2"); auth.user = { id: "owner-1", emailVerified: true }; });

describe("notification inbox prefetch", () => {
  it("uses the navbar's prefetched first page once instead of a second request", async () => {
    const fetcher = vi.fn(async () => Response.json(page("early")));
    vi.stubGlobal("fetch", fetcher);
    prefetchInbox("owner-1");
    prefetchInbox("owner-1");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual([expect.stringContaining("/api/notifications?limit=20&offset=0"), { headers: { "X-Localley-Notification-Owner": "owner-1" } }]);
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications.map((n: { id: string }) => n.id)).toEqual(["early"]));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fetches normally when nothing was prefetched or the prefetch failed", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("down", { status: 503 })).mockImplementation(async () => Response.json(page("fresh")));
    vi.stubGlobal("fetch", fetcher);
    prefetchInbox("owner-1");
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications.map((n: { id: string }) => n.id)).toEqual(["fresh"]));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never hands one owner's prefetched page to another owner", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => Response.json(page((init?.headers as Record<string, string>)["X-Localley-Notification-Owner"])));
    vi.stubGlobal("fetch", fetcher);
    prefetchInbox("owner-1");
    auth.user = { id: "owner-2", emailVerified: true };
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.notifications.map((n: { id: string }) => n.id)).toEqual(["owner-2"]));
  });
});
