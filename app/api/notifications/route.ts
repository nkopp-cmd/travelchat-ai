import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import {
    getUserNotifications,
    markAllNotificationsRead,
} from "@/lib/notifications";
import { Errors, handleApiError } from "@/lib/api-errors";
import { assertPreviewNotificationUser, isPreviewNotificationCandidate,
    markAllPreviewNotificationsRead, parsePreviewNotificationPage,
    previewNotifications } from "@/lib/app-data/preview-notifications";

const candidateHeaders = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };

// GET /api/notifications - Get user notifications
export async function GET(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        if (isPreviewNotificationCandidate(request)) {
            const page = parsePreviewNotificationPage(request);
            if (!page) return NextResponse.json({ error: "Invalid notification page" }, { status: 400, headers: candidateHeaders });
            try {
                await assertPreviewNotificationUser(userId);
                return NextResponse.json(await previewNotifications(userId, page), { headers: candidateHeaders });
            } catch (error) {
                console.error("[PREVIEW_NOTIFICATIONS] Read unavailable", error);
                return NextResponse.json({ error: "Notifications unavailable" }, { status: 503, headers: candidateHeaders });
            }
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

        if (isPreviewNotificationCandidate(request)) {
            let body: unknown;
            try { body = await request.json(); } catch {
                return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: candidateHeaders });
            }
            if (!body || typeof body !== "object" || !("action" in body) || body.action !== "markAllRead") {
                return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: candidateHeaders });
            }
            try {
                await assertPreviewNotificationUser(userId);
                return NextResponse.json({ success: await markAllPreviewNotificationsRead(userId) }, { headers: candidateHeaders });
            } catch (error) {
                console.error("[PREVIEW_NOTIFICATIONS] Mark-all unavailable", error);
                return NextResponse.json({ error: "Notifications unavailable" }, { status: 503, headers: candidateHeaders });
            }
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
