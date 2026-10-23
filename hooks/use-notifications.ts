"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@/lib/auth/client";
import type { Notification, NotificationPreferences } from "@/types";
import { isPreviewNotificationSettings, notificationPreferencesUrl, notificationInboxUrl } from "@/lib/app-data/notification-candidate-url";
import { INBOX_PAGE, inboxOwnerHeaders, takePrefetchedInbox } from "@/lib/notifications/inbox-prefetch";

const ownerHeaders = inboxOwnerHeaders;
const limit = INBOX_PAGE;
const unavailable = "Notifications are currently unavailable.";
type InboxState = { owner: string | null; notifications: Notification[]; unreadCount: number; isLoading: boolean;
    error: string | null; offset: number; hasMore: boolean; isWritable: boolean };
const emptyInbox = (owner: string | null): InboxState => ({ owner, notifications: [], unreadCount: 0,
    isLoading: !!owner, error: null, offset: 0, hasMore: false, isWritable: false });

export function useNotifications() {
    const { isSignedIn, user } = useUser();
    const owner = isSignedIn && user?.id && user.emailVerified ? user.id : null;
    const [state, setState] = useState<InboxState>(() => emptyInbox(owner));
    const epoch = useRef(0), readSequence = useRef(0), controller = useRef<AbortController | null>(null);
    // Hide old-owner content synchronously; effects and network cleanup follow after render.
    const visible = state.owner === owner ? state : emptyInbox(owner);

    const fetchPage = useCallback(async (offset: number, reset: boolean) => {
        if (!owner) return;
        const generation = epoch.current, sequence = ++readSequence.current;
        controller.current?.abort();
        const abort = new AbortController(); controller.current = abort;
        const current = () => epoch.current === generation && readSequence.current === sequence;
        setState(prev => prev.owner === owner ? { ...prev, isLoading: true, error: null } : emptyInbox(owner));
        try {
            // The navbar may already have started this first page (lib/notifications/inbox-prefetch).
            const early = offset === 0 && reset ? await takePrefetchedInbox(owner) : undefined;
            let data = (early ?? null) as Awaited<ReturnType<Response["json"]>> | null;
            if (!data) {
                const response = await fetch(notificationInboxUrl(undefined, { limit, offset }),
                    { signal: abort.signal, headers: ownerHeaders(owner) });
                if (!response.ok) throw Error("Failed to fetch notifications");
                data = await response.json();
            }
            if (!Array.isArray(data.notifications) || !Number.isSafeInteger(data.unreadCount) || data.unreadCount < 0) throw Error(unavailable);
            if (!current()) return;
            setState(prev => prev.owner !== owner ? prev : { ...prev,
                notifications: reset ? data.notifications : [...prev.notifications, ...data.notifications],
                unreadCount: data.unreadCount, offset: offset + limit,
                hasMore: typeof data.hasMore === "boolean" ? data.hasMore : data.notifications.length === limit,
                isWritable: data.storageWritable !== false, isLoading: false, error: null });
        } catch (error) {
            if (current() && !abort.signal.aborted) setState(prev => prev.owner !== owner ? prev : {
                ...prev, error: error instanceof Error ? error.message : unavailable, isLoading: false });
        }
    }, [owner]);

    useEffect(() => {
        const generation = ++epoch.current; setState(emptyInbox(owner));
        if (owner) void fetchPage(0, true);
        return () => { epoch.current = generation + 1; readSequence.current = 0; controller.current?.abort(); };
    }, [owner, fetchPage]);

    const mutate = useCallback(async (id: string | undefined, method: "PATCH" | "POST" | "DELETE") => {
        if (!owner || !visible.isWritable) return;
        const generation = epoch.current;
        try {
            const response = await fetch(notificationInboxUrl(id), { method,
                headers: { ...ownerHeaders(owner), ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
                ...(method === "POST" ? { body: JSON.stringify({ action: "markAllRead" }) } : {}) });
            if (!response.ok || (await response.json()).success !== true) throw Error(unavailable);
            if (epoch.current !== generation) return;
            // A read started before this write must not restore stale rows or counts.
            readSequence.current++; controller.current?.abort();
            setState(prev => {
                if (prev.owner !== owner) return prev;
                const row = prev.notifications.find(n => n.id === id);
                return { ...prev, error: null, isLoading: false,
                    offset: method === "DELETE" && row ? Math.max(0, prev.offset - 1) : prev.offset,
                    notifications: method === "DELETE" ? prev.notifications.filter(n => n.id !== id)
                        : prev.notifications.map(n => !id || n.id === id
                            ? { ...n, read: true, readAt: n.readAt ?? new Date().toISOString() } : n),
                    unreadCount: method === "POST" ? 0 : Math.max(0, prev.unreadCount - (row && !row.read ? 1 : 0)) };
            });
        } catch {
            if (epoch.current === generation) setState(prev => prev.owner !== owner ? prev : { ...prev, error: unavailable });
        }
    }, [owner, visible.isWritable]);

    return { isPreviewCandidate: isPreviewNotificationSettings(), notifications: visible.notifications,
        unreadCount: visible.unreadCount, isLoading: visible.isLoading, error: visible.error,
        hasMore: visible.hasMore, isWritable: visible.isWritable,
        loadMore: async () => { if (!visible.isLoading && visible.hasMore) await fetchPage(visible.offset, false); },
        refresh: async () => fetchPage(0, true), markAsRead: async (id: string) => mutate(id, "PATCH"),
        markAllAsRead: async () => mutate(undefined, "POST"), deleteNotification: async (id: string) => mutate(id, "DELETE") };
}

type PreferenceState = { owner: string | null; preferences: NotificationPreferences | null; isLoading: boolean;
    error: string | null; isWritable: boolean; deliveryEnabled: boolean };
const emptyPreferences = (owner: string | null): PreferenceState => ({ owner, preferences: null,
    isLoading: !!owner, error: null, isWritable: false, deliveryEnabled: false });
function preferenceData(data: NotificationPreferences): NotificationPreferences {
    const value = { ...data } as NotificationPreferences & { storageWritable?: boolean; deliveryEnabled?: boolean };
    delete value.storageWritable; delete value.deliveryEnabled;
    return value;
}

export function useNotificationPreferences() {
    const { isSignedIn, user } = useUser();
    const owner = isSignedIn && user?.id && user.emailVerified ? user.id : null;
    const [state, setState] = useState<PreferenceState>(() => emptyPreferences(owner));
    const epoch = useRef(0);
    const visible = state.owner === owner ? state : emptyPreferences(owner);
    useEffect(() => {
        const generation = ++epoch.current, abort = new AbortController();
        setState(emptyPreferences(owner));
        if (owner) void (async () => {
            try {
                const response = await fetch(notificationPreferencesUrl(), { signal: abort.signal, headers: ownerHeaders(owner) });
                if (!response.ok) throw Error("Notification settings are currently unavailable.");
                const data = await response.json();
                if (data.available === false) throw Error("Notification settings are currently unavailable.");
                if (epoch.current !== generation) return;
                setState(prev => prev.owner !== owner ? prev : { ...prev, preferences: preferenceData(data), isLoading: false,
                    isWritable: data.storageWritable !== false, deliveryEnabled: data.deliveryEnabled !== false });
            } catch {
                if (epoch.current === generation && !abort.signal.aborted) setState(prev => prev.owner !== owner ? prev : {
                    ...prev, isLoading: false, error: "Notification settings are currently unavailable." });
            }
        })();
        return () => { epoch.current = generation + 1; abort.abort(); };
    }, [owner]);

    const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
        if (!owner || !visible.isWritable) throw Error("Notification settings are temporarily read-only.");
        const generation = epoch.current;
        const response = await fetch(notificationPreferencesUrl(), { method: "PATCH",
            headers: { ...ownerHeaders(owner), "Content-Type": "application/json" }, body: JSON.stringify(updates) });
        if (!response.ok) throw Error("Failed to update preferences");
        const data = await response.json();
        if (epoch.current !== generation) throw Error("Your account changed. Reload your settings.");
        setState(prev => prev.owner !== owner ? prev : { ...prev, preferences: preferenceData(data),
            isWritable: data.storageWritable !== false, deliveryEnabled: data.deliveryEnabled !== false });
    }, [owner, visible.isWritable]);

    return { isPreviewCandidate: isPreviewNotificationSettings(), preferences: visible.preferences,
        isLoading: visible.isLoading, error: visible.error, isWritable: visible.isWritable,
        deliveryEnabled: visible.deliveryEnabled, updatePreferences };
}
