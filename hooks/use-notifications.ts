"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { Notification, NotificationPreferences } from "@/types";

interface UseNotificationsReturn {
    notifications: Notification[];
    unreadCount: number;
    isLoading: boolean;
    error: string | null;
    hasMore: boolean;
    loadMore: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    refresh: () => Promise<void>;
}

export function useNotifications(): UseNotificationsReturn {
    const { isSignedIn } = useUser();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const limit = 20;

    const fetchNotifications = useCallback(async (reset = false) => {
        if (!isSignedIn) return;

        try {
            setIsLoading(true);
            setError(null);

            const currentOffset = reset ? 0 : offset;
            const response = await fetch(
                `/api/notifications?limit=${limit}&offset=${currentOffset}`
            );

            if (!response.ok) {
                throw new Error("Failed to fetch notifications");
            }

            const data = await response.json();

            if (reset) {
                setNotifications(data.notifications);
                setOffset(limit);
            } else {
                setNotifications((prev) => [...prev, ...data.notifications]);
                setOffset((prev) => prev + limit);
            }

            setUnreadCount(data.unreadCount);
            setHasMore(data.notifications.length === limit);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
            setIsLoading(false);
        }
    }, [isSignedIn, offset]);

    // Initial fetch
    useEffect(() => {
        if (isSignedIn) {
            fetchNotifications(true);
        }
    }, [isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

    const refresh = useCallback(async () => {
        await fetchNotifications(true);
    }, [fetchNotifications]);

    const loadMore = useCallback(async () => {
        if (!hasMore || isLoading) return;
        await fetchNotifications(false);
    }, [hasMore, isLoading, fetchNotifications]);

    const markAsRead = useCallback(async (id: string) => {
        try {
            const response = await fetch(`/api/notifications/${id}`, {
                method: "PATCH",
            });

            if (!response.ok) {
                throw new Error("Failed to mark notification as read");
            }

            setNotifications((prev) =>
                prev.map((n) =>
                    n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n
                )
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
        } catch (err) {
            console.error("Error marking notification as read:", err);
        }
    }, []);

    const markAllAsRead = useCallback(async () => {
        try {
            const response = await fetch("/api/notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "markAllRead" }),
            });

            if (!response.ok) {
                throw new Error("Failed to mark all notifications as read");
            }

            setNotifications((prev) =>
                prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
            );
            setUnreadCount(0);
        } catch (err) {
            console.error("Error marking all notifications as read:", err);
        }
    }, []);

    const deleteNotification = useCallback(async (id: string) => {
        try {
            const response = await fetch(`/api/notifications/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Failed to delete notification");
            }

            const notification = notifications.find((n) => n.id === id);
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            if (notification && !notification.read) {
                setUnreadCount((prev) => Math.max(0, prev - 1));
            }
        } catch (err) {
            console.error("Error deleting notification:", err);
        }
    }, [notifications]);

    return {
        notifications,
        unreadCount,
        isLoading,
        error,
        hasMore,
        loadMore,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refresh,
    };
}

interface UseNotificationPreferencesReturn {
    preferences: NotificationPreferences | null;
    isLoading: boolean;
    error: string | null;
    updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>;
}

export function useNotificationPreferences(): UseNotificationPreferencesReturn {
    const { isSignedIn } = useUser();
    const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchPreferences() {
            if (!isSignedIn) return;

            try {
                setIsLoading(true);
                setError(null);

                const response = await fetch("/api/notifications/preferences");

                if (!response.ok) {
                    throw new Error("Failed to fetch preferences");
                }

                const data = await response.json();
                setPreferences(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : "An error occurred");
            } finally {
                setIsLoading(false);
            }
        }

        fetchPreferences();
    }, [isSignedIn]);

    const updatePreferences = useCallback(async (updates: Partial<NotificationPreferences>) => {
        try {
            const response = await fetch("/api/notifications/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });

            if (!response.ok) {
                throw new Error("Failed to update preferences");
            }

            const data = await response.json();
            setPreferences(data);
        } catch (err) {
            console.error("Error updating preferences:", err);
            throw err;
        }
    }, []);

    return {
        preferences,
        isLoading,
        error,
        updatePreferences,
    };
}
