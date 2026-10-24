import type { Notification, NotificationType } from "@/types";

// Pure display helpers for notifications. No server imports: client components (notification-center) use them.

// Get notification icon and color based on type
export function getNotificationMeta(type: NotificationType): { icon: string; color: string } {
    switch (type) {
        case 'achievement':
            return { icon: '🏆', color: 'text-amber-500' };
        case 'level_up':
            return { icon: '⬆️', color: 'text-emerald-500' };
        case 'new_spot':
            return { icon: '📍', color: 'text-violet-500' };
        case 'itinerary_shared':
            return { icon: '📤', color: 'text-blue-500' };
        case 'itinerary_liked':
            return { icon: '❤️', color: 'text-rose-500' };
        case 'review_helpful':
            return { icon: '👍', color: 'text-green-500' };
        case 'friend_request':
            return { icon: '👋', color: 'text-indigo-500' };
        case 'friend_accepted':
            return { icon: '🤝', color: 'text-indigo-500' };
        case 'challenge_start':
            return { icon: '🎯', color: 'text-orange-500' };
        case 'challenge_ending':
            return { icon: '⏰', color: 'text-red-500' };
        case 'weekly_digest':
            return { icon: '📊', color: 'text-cyan-500' };
        case 'system':
        default:
            return { icon: '📢', color: 'text-gray-500' };
    }
}

// Get the URL to navigate to based on notification type
export function getNotificationUrl(notification: Notification): string {
    if (notification.data?.url) {
        return notification.data.url as string;
    }

    switch (notification.type) {
        case 'achievement':
        case 'level_up':
            return '/profile';
        case 'new_spot':
            return notification.data?.spotId ? `/spots/${notification.data.spotId}` : '/spots';
        case 'itinerary_shared':
        case 'itinerary_liked':
            return notification.data?.itineraryId
                ? `/itineraries/${notification.data.itineraryId}`
                : '/itineraries';
        case 'review_helpful':
            return notification.data?.spotId ? `/spots/${notification.data.spotId}` : '/spots';
        case 'friend_request':
        case 'friend_accepted':
            return notification.data?.userId
                ? `/users/${notification.data.userId}`
                : '/profile';
        case 'challenge_start':
        case 'challenge_ending':
            return '/challenges';
        case 'weekly_digest':
            return '/profile';
        case 'system':
        default:
            return '/dashboard';
    }
}
