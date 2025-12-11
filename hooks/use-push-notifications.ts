"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";

interface UsePushNotificationsReturn {
    isSupported: boolean;
    isSubscribed: boolean;
    isLoading: boolean;
    error: string | null;
    permission: NotificationPermission | null;
    subscribe: () => Promise<boolean>;
    unsubscribe: () => Promise<boolean>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
    const { isSignedIn } = useUser();
    const [isSupported, setIsSupported] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [permission, setPermission] = useState<NotificationPermission | null>(null);

    // Check if push notifications are supported
    useEffect(() => {
        const supported =
            typeof window !== "undefined" &&
            "serviceWorker" in navigator &&
            "PushManager" in window &&
            "Notification" in window;

        setIsSupported(supported);

        if (supported) {
            setPermission(Notification.permission);
        }

        setIsLoading(false);
    }, []);

    // Check subscription status on mount
    useEffect(() => {
        async function checkSubscription() {
            if (!isSupported || !isSignedIn) return;

            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                setIsSubscribed(!!subscription);
            } catch (err) {
                console.error("Error checking push subscription:", err);
            }
        }

        checkSubscription();
    }, [isSupported, isSignedIn]);

    // Register service worker
    const registerServiceWorker = useCallback(async () => {
        if (!("serviceWorker" in navigator)) {
            throw new Error("Service workers not supported");
        }

        try {
            const registration = await navigator.serviceWorker.register("/sw.js");
            await navigator.serviceWorker.ready;
            return registration;
        } catch (err) {
            console.error("Service worker registration failed:", err);
            throw err;
        }
    }, []);

    // Subscribe to push notifications
    const subscribe = useCallback(async (): Promise<boolean> => {
        if (!isSupported) {
            setError("Push notifications not supported");
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Request notification permission
            const permission = await Notification.requestPermission();
            setPermission(permission);

            if (permission !== "granted") {
                setError("Notification permission denied");
                return false;
            }

            // Register service worker
            const registration = await registerServiceWorker();

            // Get VAPID public key
            const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

            if (!vapidPublicKey) {
                setError("Push notifications not configured");
                return false;
            }

            // Convert VAPID key to Uint8Array
            const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

            // Subscribe to push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
            });

            // Save subscription to server
            const response = await fetch("/api/notifications/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to save subscription");
            }

            setIsSubscribed(true);
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to subscribe";
            setError(message);
            console.error("Error subscribing to push:", err);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [isSupported, registerServiceWorker]);

    // Unsubscribe from push notifications
    const unsubscribe = useCallback(async (): Promise<boolean> => {
        if (!isSupported) {
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                setIsSubscribed(false);
                return true;
            }

            // Unsubscribe from push manager
            await subscription.unsubscribe();

            // Remove subscription from server
            await fetch("/api/notifications/push/subscribe", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    endpoint: subscription.endpoint,
                }),
            });

            setIsSubscribed(false);
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to unsubscribe";
            setError(message);
            console.error("Error unsubscribing from push:", err);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [isSupported]);

    return {
        isSupported,
        isSubscribed,
        isLoading,
        error,
        permission,
        subscribe,
        unsubscribe,
    };
}

// Convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}
