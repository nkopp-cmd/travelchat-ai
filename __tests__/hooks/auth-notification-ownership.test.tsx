import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ owner: "owner-a" as string | null, verified: true, subscribe: vi.fn(), unsubscribe: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ useUser: () => ({ isSignedIn: !!m.owner,
  user: m.owner ? { id: m.owner, emailVerified: m.verified } : null }) }));
vi.mock("@/hooks/use-push-notifications", () => ({ usePushNotifications: () => ({ isSupported: true,
  isSubscribed: false, isLoading: false, permission: "default", subscribe: m.subscribe, unsubscribe: m.unsubscribe }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: m.toast }) }));
import { useNotificationPreferences, useNotifications } from "@/hooks/use-notifications";
import { NotificationPreferencesSection } from "@/components/settings/notification-preferences";
const preferences = (owner: string, writable = true) => ({ clerkUserId: owner, pushEnabled: false,
  emailEnabled: false, achievements: false, levelUps: false, newSpots: false, social: false,
  challenges: false, weeklyDigest: false, system: false, timezone: "UTC", storageWritable: writable, deliveryEnabled: false });
const notice = (owner: string) => ({ id: `notice-${owner}`, clerkUserId: owner, type: "system",
  title: `Private ${owner}`, message: "Private message", read: false, createdAt: "2026-10-17T00:00:00Z" });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
  m.owner = "owner-a"; m.verified = true; vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const owner = new Headers(init?.headers).get("x-localley-notification-owner")!;
    if (url.includes("preferences")) return response(preferences(owner));
    if (init?.method) return response({ success: true });
    return response({ notifications: [notice(owner)], unreadCount: 1, hasMore: false, storageWritable: true });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("normal notification account privacy and truthful capabilities", () => {
  it("clears inbox and preferences immediately on logout and account switch", async () => {
    const hook = renderHook(() => ({ inbox: useNotifications(), settings: useNotificationPreferences() }));
    await waitFor(() => expect(hook.result.current.inbox.notifications).toHaveLength(1));
    await waitFor(() => expect(hook.result.current.settings.preferences?.clerkUserId).toBe("owner-a"));
    m.owner = null; hook.rerender(); expect(hook.result.current.inbox.notifications).toEqual([]);
    expect(hook.result.current.inbox.unreadCount).toBe(0); expect(hook.result.current.settings.preferences).toBeNull();
    m.owner = "owner-b"; hook.rerender(); expect(hook.result.current.inbox.notifications).toEqual([]);
    expect(hook.result.current.settings.preferences).toBeNull();
    await waitFor(() => expect(hook.result.current.inbox.notifications[0]?.clerkUserId).toBe("owner-b"));
    await waitFor(() => expect(hook.result.current.settings.preferences?.clerkUserId).toBe("owner-b"));
  });
  it("discards late old-account reads even when the transport ignores abort", async () => {
    const inboxA = deferred<Response>(), prefsA = deferred<Response>();
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const owner = new Headers(init?.headers).get("x-localley-notification-owner");
      if (owner === "owner-a") return String(url).includes("preferences") ? prefsA.promise : inboxA.promise;
      return response(String(url).includes("preferences") ? preferences("owner-b") : {
        notifications: [notice("owner-b")], unreadCount: 1, storageWritable: true });
    });
    const hook = renderHook(() => ({ inbox: useNotifications(), settings: useNotificationPreferences() }));
    m.owner = "owner-b"; hook.rerender();
    await waitFor(() => expect(hook.result.current.settings.preferences?.clerkUserId).toBe("owner-b"));
    await act(async () => { inboxA.resolve(response({ notifications: [notice("owner-a")], unreadCount: 9 })); prefsA.resolve(response(preferences("owner-a"))); });
    expect(hook.result.current.inbox.notifications[0].clerkUserId).toBe("owner-b");
    expect(hook.result.current.settings.preferences?.clerkUserId).toBe("owner-b");
  });
  it("discards old-owner writes after a switch and binds requests to the initiating owner", async () => {
    const hook = renderHook(() => ({ inbox: useNotifications(), settings: useNotificationPreferences() }));
    await waitFor(() => expect(hook.result.current.settings.preferences).not.toBeNull());
    await waitFor(() => expect(hook.result.current.inbox.notifications).toHaveLength(1));
    const write = deferred<Response>(), patch = deferred<Response>(), original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) => init?.method === "DELETE" ? write.promise
      : init?.method === "PATCH" ? patch.promise : original(url, init));
    let deletion!: Promise<void>, update!: Promise<string>;
    act(() => { deletion = hook.result.current.inbox.deleteNotification("notice-owner-a");
      update = hook.result.current.settings.updatePreferences({ social: true }).then(() => "saved", () => "account changed"); });
    m.owner = "owner-b"; hook.rerender();
    await waitFor(() => expect(hook.result.current.settings.preferences?.clerkUserId).toBe("owner-b"));
    await act(async () => { write.resolve(response({ success: true })); patch.resolve(response(preferences("owner-a"))); await deletion; expect(await update).toBe("account changed"); });
    expect(hook.result.current.inbox.notifications[0].clerkUserId).toBe("owner-b");
    expect(hook.result.current.settings.preferences?.clerkUserId).toBe("owner-b");
    for (const [, init] of vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method))
      expect(new Headers(init?.headers).get("x-localley-notification-owner")).toBe("owner-a");
  });
  it("hides prior content when the current account becomes unverified", async () => {
    const hook = renderHook(() => ({ inbox: useNotifications(), settings: useNotificationPreferences() }));
    await waitFor(() => expect(hook.result.current.inbox.notifications).toHaveLength(1));
    m.verified = false; hook.rerender(); expect(hook.result.current.inbox.notifications).toEqual([]);
    expect(hook.result.current.settings.preferences).toBeNull();
  });
  it("blocks writes in read-only mode and does not claim delivery or request browser permission", async () => {
    vi.mocked(fetch).mockResolvedValue(response(preferences("owner-a", false)));
    render(<NotificationPreferencesSection />);
    const toggle = await screen.findByRole("switch", { name: "Weekly Recap" });
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByRole("status").map(n => n.textContent).join(" ")).toContain("Changes are temporarily unavailable");
    expect(screen.queryByRole("button", { name: "Enable" })).toBeNull();
    fireEvent.click(toggle); expect(fetch).toHaveBeenCalledTimes(1); expect(m.subscribe).not.toHaveBeenCalled(); expect(m.toast).not.toHaveBeenCalled();
  });
  it("saves an active normal choice while keeping external delivery inactive", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => response({ ...preferences("owner-a"),
      ...(init?.method === "PATCH" ? JSON.parse(String(init.body)) : {}) }));
    render(<NotificationPreferencesSection />); const toggle = await screen.findByRole("switch", { name: "Weekly Recap" });
    expect(screen.getByRole("status").textContent).toContain("Email and push delivery are not enabled yet");
    fireEvent.click(toggle); await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(m.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Preferences updated" }));
    expect(m.subscribe).not.toHaveBeenCalled(); expect(m.unsubscribe).not.toHaveBeenCalled();
  });
  it("does not decrement unread count twice for idempotent reads", async () => {
    const hook = renderHook(() => useNotifications()); await waitFor(() => expect(hook.result.current.notifications).toHaveLength(1));
    await act(async () => hook.result.current.markAsRead("notice-owner-a"));
    await act(async () => hook.result.current.markAsRead("notice-owner-a")); expect(hook.result.current.unreadCount).toBe(0);
  });
  it("does not retain transport capabilities inside the saved preference object", async () => {
    const hook = renderHook(() => useNotificationPreferences());
    await waitFor(() => expect(hook.result.current.preferences).not.toBeNull());
    expect(hook.result.current.preferences).not.toHaveProperty("storageWritable");
    expect(hook.result.current.preferences).not.toHaveProperty("deliveryEnabled");
    await act(async () => hook.result.current.updatePreferences({ social: true }));
    expect(hook.result.current.preferences).not.toHaveProperty("storageWritable");
  });
  it("keeps delete pagination aligned and discards a read that predates the delete", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ ...notice("owner-a"), id: `notice-${i}` }));
    const oldRead = deferred<Response>(); let reads = 0;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === "DELETE") { rows.splice(0, 1); return response({ success: true }); }
      reads++;
      if (reads === 2) return oldRead.promise;
      const offset = Number(new URL(String(url), "https://www.localley.io").searchParams.get("offset"));
      return response({ notifications: rows.slice(offset, offset + 20), unreadCount: rows.length, storageWritable: true });
    });
    const hook = renderHook(() => useNotifications());
    await waitFor(() => expect(hook.result.current.notifications).toHaveLength(20));
    let refresh!: Promise<void>; act(() => { refresh = hook.result.current.refresh(); });
    await act(async () => hook.result.current.deleteNotification("notice-0"));
    await act(async () => { oldRead.resolve(response({ notifications: [notice("stale")], unreadCount: 99 })); await refresh; });
    expect(hook.result.current.notifications).toHaveLength(19); expect(hook.result.current.unreadCount).toBe(20);
    await act(async () => hook.result.current.loadMore());
    expect(hook.result.current.notifications).toHaveLength(20);
    expect(hook.result.current.notifications.at(-1)?.id).toBe("notice-20");
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain("offset=19");
  });
});
