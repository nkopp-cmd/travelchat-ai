import webPush from "web-push";
import { createSupabaseAdmin } from "./supabase";
import { NotificationType, Notification } from "@/types";

// Configure web-push with VAPID keys
// These should be generated once and stored in environment variables
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@localley.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    image?: string;
    tag?: string;
    data?: {
        url?: string;
        notificationId?: string;
        [key: string]: unknown;
    };
    actions?: Array<{
        action: string;
        title: string;
        icon?: string;
    }>;
}

// Send push notification to a single subscription
async function sendPushToSubscription(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: PushPayload
): Promise<boolean> {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.warn("VAPID keys not configured, skipping push notification");
        return false;
    }

    try {
        await webPush.sendNotification(
            {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.p256dh,
                    auth: subscription.auth,
                },
            },
            JSON.stringify(payload)
        );
        return true;
    } catch (error) {
        // Handle expired/invalid subscriptions
        if (error instanceof webPush.WebPushError) {
            if (error.statusCode === 404 || error.statusCode === 410) {
                // Subscription expired or invalid - remove it
                const supabase = createSupabaseAdmin();
                await supabase
                    .from("push_subscriptions")
                    .delete()
                    .eq("endpoint", subscription.endpoint);
                console.log("Removed invalid push subscription:", subscription.endpoint);
            }
        }
        console.error("Error sending push notification:", error);
        return false;
    }
}

// Send push notification to all of a user's subscriptions
export async function sendPushNotification(
    clerkUserId: string,
    payload: PushPayload
): Promise<number> {
    const supabase = createSupabaseAdmin();

    // Get all subscriptions for the user
    const { data: subscriptions, error } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("clerk_user_id", clerkUserId);

    if (error || !subscriptions?.length) {
        return 0;
    }

    // Send to all subscriptions in parallel
    const results = await Promise.all(
        subscriptions.map((sub) => sendPushToSubscription(sub, payload))
    );

    return results.filter(Boolean).length;
}

// Get icon URL based on notification type
function getNotificationIcon(type: NotificationType): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
    return `${baseUrl}/icons/notification-${type}.png`;
}

// Convert in-app notification to push payload
export function notificationToPushPayload(notification: Notification): PushPayload {
    const icon = getNotificationIcon(notification.type);
    const badge = `${process.env.NEXT_PUBLIC_BASE_URL || ""}/icons/badge.png`;

    // Determine URL based on notification type and data
    let url = notification.data?.url as string | undefined;
    if (!url) {
        switch (notification.type) {
            case "achievement":
            case "level_up":
                url = "/profile";
                break;
            case "new_spot":
                url = notification.data?.spotId
                    ? `/spots/${notification.data.spotId}`
                    : "/spots";
                break;
            case "itinerary_shared":
            case "itinerary_liked":
                url = notification.data?.itineraryId
                    ? `/itineraries/${notification.data.itineraryId}`
                    : "/itineraries";
                break;
            case "challenge_start":
            case "challenge_ending":
                url = "/challenges";
                break;
            default:
                url = "/dashboard";
        }
    }

    return {
        title: notification.title,
        body: notification.message,
        icon,
        badge,
        tag: `localley-${notification.type}-${notification.id}`,
        data: {
            url,
            notificationId: notification.id,
            ...notification.data,
        },
        actions: [
            {
                action: "open",
                title: "View",
            },
            {
                action: "dismiss",
                title: "Dismiss",
            },
        ],
    };
}

// Check if user should receive push notification (respects preferences and quiet hours)
export async function shouldSendPush(
    clerkUserId: string,
    notificationType: NotificationType
): Promise<boolean> {
    const supabase = createSupabaseAdmin();

    const { data: prefs, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("clerk_user_id", clerkUserId)
        .single();

    if (error || !prefs) {
        return true; // Default to sending if no preferences
    }

    // Check if push is enabled globally
    if (!prefs.push_enabled) {
        return false;
    }

    // Check specific notification type preference
    switch (notificationType) {
        case "achievement":
            return prefs.achievements;
        case "level_up":
            return prefs.level_ups;
        case "new_spot":
            return prefs.new_spots;
        case "itinerary_shared":
        case "itinerary_liked":
        case "review_helpful":
        case "friend_request":
        case "friend_accepted":
            return prefs.social;
        case "challenge_start":
        case "challenge_ending":
            return prefs.challenges;
        case "weekly_digest":
            return prefs.weekly_digest;
        case "system":
            return prefs.system;
        default:
            return true;
    }

    // TODO: Add quiet hours check
    // const now = new Date();
    // const userTimezone = prefs.timezone || "UTC";
    // ...
}

// Helper to create and send notification with push
export async function createAndSendNotification({
    clerkUserId,
    type,
    title,
    message,
    data,
}: {
    clerkUserId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
}): Promise<{ notification: Notification | null; pushSent: number }> {
    const supabase = createSupabaseAdmin();

    // Create in-app notification
    const { data: record, error } = await supabase
        .from("notifications")
        .insert({
            clerk_user_id: clerkUserId,
            type,
            title,
            message,
            data: data || {},
        })
        .select()
        .single();

    if (error) {
        console.error("Error creating notification:", error);
        return { notification: null, pushSent: 0 };
    }

    const notification: Notification = {
        id: record.id,
        clerkUserId: record.clerk_user_id,
        type: record.type,
        title: record.title,
        message: record.message,
        data: record.data || undefined,
        read: record.read,
        readAt: record.read_at || undefined,
        createdAt: record.created_at,
    };

    // Check if we should send push
    const shouldPush = await shouldSendPush(clerkUserId, type);

    let pushSent = 0;
    if (shouldPush) {
        const payload = notificationToPushPayload(notification);
        pushSent = await sendPushNotification(clerkUserId, payload);
    }

    return { notification, pushSent };
}
