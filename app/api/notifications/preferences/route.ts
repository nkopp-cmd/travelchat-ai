import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import {
    NotificationStorageUnavailableError,
    getNotificationPreferences,
    updateNotificationPreferences,
} from "@/lib/notifications";
import { Errors, handleApiError } from "@/lib/api-errors";

// GET /api/notifications/preferences - Get notification preferences
export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const preferences = await getNotificationPreferences(userId);

        if (!preferences) {
            return Errors.databaseError();
        }

        return NextResponse.json(preferences);
    } catch (error) {
        if (error instanceof NotificationStorageUnavailableError) {
            return NextResponse.json({ available: false, preferences: null, message: error.message },
                { headers: { "Cache-Control": "private, no-store" } });
        }
        return handleApiError(error, "notification-preferences-get");
    }
}

// PATCH /api/notifications/preferences - Update notification preferences
export async function PATCH(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const updates = await request.json();
        const preferences = await updateNotificationPreferences(userId, updates);

        if (!preferences) {
            return Errors.databaseError();
        }

        return NextResponse.json(preferences);
    } catch (error) {
        if (error instanceof NotificationStorageUnavailableError) {
            return NextResponse.json({ error: "notifications_unavailable", message: error.message },
                { status: 503, headers: { "Cache-Control": "private, no-store" } });
        }
        return handleApiError(error, "notification-preferences-update");
    }
}
