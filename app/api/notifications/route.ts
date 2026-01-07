import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
    getUserNotifications,
    markAllNotificationsRead,
} from "@/lib/notifications";
import { Errors, handleApiError } from "@/lib/api-errors";

// GET /api/notifications - Get user notifications
export async function GET(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const searchParams = request.nextUrl.searchParams;
        const limit = parseInt(searchParams.get("limit") || "20", 10);
        const offset = parseInt(searchParams.get("offset") || "0", 10);
        const unreadOnly = searchParams.get("unreadOnly") === "true";

        const result = await getUserNotifications(userId, { limit, offset, unreadOnly });

        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, "notifications-get");
    }
}

// POST /api/notifications - Mark all as read
export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await request.json();

        if (body.action === "markAllRead") {
            const success = await markAllNotificationsRead(userId);
            return NextResponse.json({ success });
        }

        return Errors.validationError("Invalid action");
    } catch (error) {
        return handleApiError(error, "notifications-post");
    }
}
