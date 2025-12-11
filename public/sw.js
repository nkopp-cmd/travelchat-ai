// Localley Service Worker for Push Notifications
const CACHE_NAME = "localley-v1";

// Handle push events
self.addEventListener("push", (event) => {
    if (!event.data) {
        console.log("Push event with no data");
        return;
    }

    try {
        const payload = event.data.json();
        const { title, body, icon, badge, image, tag, data, actions } = payload;

        const options = {
            body,
            icon: icon || "/icons/icon-192x192.png",
            badge: badge || "/icons/badge.png",
            image,
            tag: tag || "localley-notification",
            data: data || {},
            actions: actions || [],
            vibrate: [100, 50, 100],
            requireInteraction: false,
        };

        event.waitUntil(self.registration.showNotification(title, options));
    } catch (error) {
        console.error("Error processing push notification:", error);
    }
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const action = event.action;
    const data = event.notification.data;

    if (action === "dismiss") {
        return;
    }

    // Determine URL to open
    const url = data?.url || "/dashboard";
    const fullUrl = new URL(url, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            // Check if there's already a window open
            for (const client of clientList) {
                if (client.url === fullUrl && "focus" in client) {
                    return client.focus();
                }
            }

            // Open a new window
            if (clients.openWindow) {
                return clients.openWindow(fullUrl);
            }
        })
    );

    // Mark notification as read via API (optional)
    if (data?.notificationId) {
        fetch(`/api/notifications/${data.notificationId}`, {
            method: "PATCH",
            credentials: "include",
        }).catch(() => {
            // Ignore errors - user will see notification in-app anyway
        });
    }
});

// Handle notification close
self.addEventListener("notificationclose", (event) => {
    // Analytics or cleanup could go here
    console.log("Notification closed:", event.notification.tag);
});

// Handle service worker install
self.addEventListener("install", (event) => {
    console.log("Service worker installing...");
    self.skipWaiting();
});

// Handle service worker activate
self.addEventListener("activate", (event) => {
    console.log("Service worker activating...");
    event.waitUntil(
        Promise.all([
            // Claim all clients
            clients.claim(),
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            }),
        ])
    );
});
