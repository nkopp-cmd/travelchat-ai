import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ candidate: true, signed: true }));
vi.mock("@/lib/auth/client", () => ({ useUser: () => ({ isSignedIn: mocks.signed }) }));
vi.mock("@/lib/app-data/notification-candidate-url", async (original) => {
  const actual = await original<typeof import("@/lib/app-data/notification-candidate-url")>();
  return { ...actual, isPreviewNotificationSettings: () => mocks.candidate,
    notificationInboxUrl: (id?: string, page?: { limit: number; offset: number }) => {
      const query = new URLSearchParams();
      if (page) { query.set("limit", String(page.limit)); query.set("offset", String(page.offset)); }
      if (mocks.candidate) query.set("data_candidate", "d1");
      return `/api/notifications${id ? `/${id}` : ""}${query.size ? `?${query}` : ""}`;
    } };
});
import { useNotifications } from "@/hooks/use-notifications";
const rows = Array.from({ length: 21 }, (_, i) => ({ id: `id-${i}`, clerkUserId: "owner", type: "system",
  title: `Title ${i}`, message: "Message", data: {}, read: false, createdAt: "2026-10-03T12:00:00Z" }));
let stored: typeof rows;
beforeEach(() => {
  mocks.candidate = true; mocks.signed = true; stored = rows.map(row => ({ ...row }));
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    const parsed = new URL(url, "https://test.local");
    const id = parsed.pathname.split("/")[3];
    if (options?.method === "DELETE") stored = stored.filter(row => row.id !== id);
    else if (options?.method) stored = stored.map(row => !id || row.id === id ? { ...row, read: true } : row);
    if (options?.method) return new Response(JSON.stringify({ success: true }));
    const offset = Number(parsed.searchParams.get("offset"));
    return new Response(JSON.stringify({ notifications: stored.slice(offset, offset + 20), unreadCount: stored.filter(row => !row.read).length }));
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function loaded() {
  const hook = renderHook(() => useNotifications());
  await waitFor(() => expect(hook.result.current.notifications).toHaveLength(20));
  return hook;
}
describe("candidate inbox hook", () => {
  it("carries the candidate through pagination and refresh", async () => {
    const hook = await loaded();
    await act(async () => hook.result.current.loadMore());
    expect(hook.result.current.notifications).toHaveLength(21); expect(hook.result.current.hasMore).toBe(false);
    await act(async () => hook.result.current.refresh()); expect(hook.result.current.notifications).toHaveLength(20);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      "/api/notifications?limit=20&offset=0&data_candidate=d1",
      "/api/notifications?limit=20&offset=20&data_candidate=d1",
      "/api/notifications?limit=20&offset=0&data_candidate=d1"]);
  });
  it("persists mark-one, mark-all and delete on the candidate without source requests", async () => {
    const hook = await loaded();
    await act(async () => hook.result.current.markAsRead("id-0"));
    expect(hook.result.current.unreadCount).toBe(20); expect(stored[0].read).toBe(true);
    await act(async () => hook.result.current.markAllAsRead());
    expect(hook.result.current.unreadCount).toBe(0); expect(stored.every(row => row.read)).toBe(true);
    await act(async () => hook.result.current.deleteNotification("id-0"));
    await act(async () => hook.result.current.refresh());
    expect(hook.result.current.notifications.some(row => row.id === "id-0")).toBe(false);
    expect(vi.mocked(fetch).mock.calls.slice(1,4).map(([url, options]) => [url, options?.method])).toEqual([
      ["/api/notifications/id-0?data_candidate=d1", "PATCH"],
      ["/api/notifications?data_candidate=d1", "POST"],
      ["/api/notifications/id-0?data_candidate=d1", "DELETE"]]);
  });
  it("preserves all normal URLs", async () => {
    mocks.candidate = false; const hook = await loaded();
    await act(async () => hook.result.current.markAsRead("id-0"));
    await act(async () => hook.result.current.markAllAsRead());
    await act(async () => hook.result.current.deleteNotification("id-0"));
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      "/api/notifications?limit=20&offset=0", "/api/notifications/id-0", "/api/notifications", "/api/notifications/id-0"]);
  });
  it.each([503,200])("refused write status %s preserves rows and counts and exposes failure", async status => {
    const hook = await loaded();
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ success: false }), { status }));
    for (const action of [() => hook.result.current.markAsRead("id-0"), () => hook.result.current.markAllAsRead(), () => hook.result.current.deleteNotification("id-0")]) {
      await act(action); expect(hook.result.current.notifications).toHaveLength(20);
      expect(hook.result.current.unreadCount).toBe(21); expect(hook.result.current.notifications.every(row => !row.read)).toBe(true);
      expect(hook.result.current.error).toContain("unavailable");
    }
  });
  it("reports failed reads and does not fall back", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 503 }));
    const hook = renderHook(() => useNotifications());
    await waitFor(() => expect(hook.result.current.error).toBe("Failed to fetch notifications"));
    expect(fetch).toHaveBeenCalledTimes(1); expect(hook.result.current.notifications).toEqual([]);
  });
});
