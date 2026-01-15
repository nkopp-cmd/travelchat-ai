import { createSupabaseAdmin } from "./supabase";
import { Notification, NotificationType, NotificationPreferences } from "@/types";

// Convert snake_case DB record to camelCase
function toNotification(record: {
    id: string;
    clerk_user_id: string;
    type: NotificationType;
    title: string;
    message: string;
    data: Record<string, unknown> | null;
    read: boolean;
    read_at: string | null;
    created_at: string;
}): Notification {
    return {
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
}

// Convert DB preferences to camelCase
function toPreferences(record: {
    clerk_user_id: string;
    push_enabled: boolean;
    email_enabled: boolean;
    achievements: boolean;
    level_ups: boolean;
    new_spots: boolean;
    social: boolean;
    challenges: boolean;
    weekly_digest: boolean;
    system: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    timezone: string;
}): NotificationPreferences {
    return {
        clerkUserId: record.clerk_user_id,
        pushEnabled: record.push_enabled,
        emailEnabled: record.email_enabled,
        achievements: record.achievements,
        levelUps: record.level_ups,
        newSpots: record.new_spots,
        social: record.social,
        challenges: record.challenges,
        weeklyDigest: record.weekly_digest,
        system: record.system,
        quietHoursStart: record.quiet_hours_start || undefined,
        quietHoursEnd: record.quiet_hours_end || undefined,
        timezone: record.timezone,
    };
}

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

// ============== Server-side functions ==============

// Check if error is a table-not-found error
function isTableMissing(error: { code?: string; message?: string }): boolean {
    return error.code === 'PGRST205' || error.code === '42P01' ||
        (error.message?.includes('does not exist') ?? false);
}

// Create a new notification
export async function createNotification({
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
}): Promise<Notification | null> {
    const supabase = createSupabaseAdmin();

    const { data: record, error } = await supabase
        .from('notifications')
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
        // Don't spam logs if table doesn't exist - expected during early setup
        if (isTableMissing(error)) {
            console.warn('[notifications] Table not found, skipping notification');
        } else {
            console.error('[notifications] Error creating:', error);
        }
        return null;
    }

    return toNotification(record);
}

// Get user notifications with pagination
export async function getUserNotifications(
    clerkUserId: string,
    options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{ notifications: Notification[]; unreadCount: number }> {
    const supabase = createSupabaseAdmin();
    const { limit = 20, offset = 0, unreadOnly = false } = options;

    let query = supabase
        .from('notifications')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (unreadOnly) {
        query = query.eq('read', false);
    }

    const [{ data: notifications, error }, { count }] = await Promise.all([
        query,
        supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('clerk_user_id', clerkUserId)
            .eq('read', false),
    ]);

    if (error) {
        // Silently handle missing table - expected during early setup
        if (!isTableMissing(error)) {
            console.error('[notifications] Error fetching:', error);
        }
        return { notifications: [], unreadCount: 0 };
    }

    return {
        notifications: (notifications || []).map(toNotification),
        unreadCount: count || 0,
    };
}

// Mark notification as read
export async function markNotificationRead(
    clerkUserId: string,
    notificationId: string
): Promise<boolean> {
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('clerk_user_id', clerkUserId);

    if (error) {
        if (!isTableMissing(error)) {
            console.error('[notifications] Error marking as read:', error);
        }
        return false;
    }

    return true;
}

// Mark all notifications as read
export async function markAllNotificationsRead(clerkUserId: string): Promise<boolean> {
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('clerk_user_id', clerkUserId)
        .eq('read', false);

    if (error) {
        if (!isTableMissing(error)) {
            console.error('[notifications] Error marking all as read:', error);
        }
        return false;
    }

    return true;
}

// Delete a notification
export async function deleteNotification(
    clerkUserId: string,
    notificationId: string
): Promise<boolean> {
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('clerk_user_id', clerkUserId);

    if (error) {
        if (!isTableMissing(error)) {
            console.error('[notifications] Error deleting:', error);
        }
        return false;
    }

    return true;
}

// Get notification preferences
export async function getNotificationPreferences(
    clerkUserId: string
): Promise<NotificationPreferences | null> {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('clerk_user_id', clerkUserId)
        .single();

    if (error) {
        // Table doesn't exist - return null silently
        if (isTableMissing(error)) {
            return null;
        }
        // If no preferences exist, create default ones
        if (error.code === 'PGRST116') {
            const { data: newData, error: insertError } = await supabase
                .from('notification_preferences')
                .insert({ clerk_user_id: clerkUserId })
                .select()
                .single();

            if (insertError) {
                if (!isTableMissing(insertError)) {
                    console.error('[notifications] Error creating preferences:', insertError);
                }
                return null;
            }

            return toPreferences(newData);
        }

        console.error('[notifications] Error fetching preferences:', error);
        return null;
    }

    return toPreferences(data);
}

// Update notification preferences
export async function updateNotificationPreferences(
    clerkUserId: string,
    updates: Partial<Omit<NotificationPreferences, 'clerkUserId'>>
): Promise<NotificationPreferences | null> {
    const supabase = createSupabaseAdmin();

    // Convert camelCase to snake_case for DB
    const dbUpdates: Record<string, unknown> = {};
    if (updates.pushEnabled !== undefined) dbUpdates.push_enabled = updates.pushEnabled;
    if (updates.emailEnabled !== undefined) dbUpdates.email_enabled = updates.emailEnabled;
    if (updates.achievements !== undefined) dbUpdates.achievements = updates.achievements;
    if (updates.levelUps !== undefined) dbUpdates.level_ups = updates.levelUps;
    if (updates.newSpots !== undefined) dbUpdates.new_spots = updates.newSpots;
    if (updates.social !== undefined) dbUpdates.social = updates.social;
    if (updates.challenges !== undefined) dbUpdates.challenges = updates.challenges;
    if (updates.weeklyDigest !== undefined) dbUpdates.weekly_digest = updates.weeklyDigest;
    if (updates.system !== undefined) dbUpdates.system = updates.system;
    if (updates.quietHoursStart !== undefined) dbUpdates.quiet_hours_start = updates.quietHoursStart;
    if (updates.quietHoursEnd !== undefined) dbUpdates.quiet_hours_end = updates.quietHoursEnd;
    if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone;
    dbUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('notification_preferences')
        .update(dbUpdates)
        .eq('clerk_user_id', clerkUserId)
        .select()
        .single();

    if (error) {
        if (!isTableMissing(error)) {
            console.error('[notifications] Error updating preferences:', error);
        }
        return null;
    }

    return toPreferences(data);
}

// Save push subscription
export async function savePushSubscription(
    clerkUserId: string,
    subscription: {
        endpoint: string;
        p256dh: string;
        auth: string;
        userAgent?: string;
    }
): Promise<boolean> {
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
            {
                clerk_user_id: clerkUserId,
                endpoint: subscription.endpoint,
                p256dh: subscription.p256dh,
                auth: subscription.auth,
                user_agent: subscription.userAgent,
                last_used_at: new Date().toISOString(),
            },
            { onConflict: 'endpoint' }
        );

    if (error) {
        if (!isTableMissing(error)) {
            console.error('[notifications] Error saving push subscription:', error);
        }
        return false;
    }

    return true;
}

// Remove push subscription
export async function removePushSubscription(
    clerkUserId: string,
    endpoint: string
): Promise<boolean> {
    const supabase = createSupabaseAdmin();

    const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('clerk_user_id', clerkUserId)
        .eq('endpoint', endpoint);

    if (error) {
        if (!isTableMissing(error)) {
            console.error('[notifications] Error removing push subscription:', error);
        }
        return false;
    }

    return true;
}

// Get all push subscriptions for a user
export async function getUserPushSubscriptions(clerkUserId: string): Promise<
    Array<{
        endpoint: string;
        p256dh: string;
        auth: string;
    }>
> {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('clerk_user_id', clerkUserId);

    if (error) {
        if (!isTableMissing(error)) {
            console.error('[notifications] Error fetching push subscriptions:', error);
        }
        return [];
    }

    return data || [];
}
