import { authNotificationResponse } from "@/lib/notifications/auth-http";
import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { markNotificationRead, deleteNotification } from "@/lib/notifications";
import { Errors, handleApiError } from "@/lib/api-errors";
import { assertPreviewNotificationUser, deletePreviewNotification,
    isPreviewNotificationCandidate, isPreviewNotificationId,
    markPreviewNotificationRead } from "@/lib/app-data/preview-notifications";

const candidateHeaders = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };

// PATCH /api/notifications/[id] - Mark notification as read
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();

        if (!userId) {
            const denied = Errors.unauthorized();
            denied.headers.set("Cache-Control", "private, no-store");
            denied.headers.set("Vary", "Cookie");
            return denied;
        }

        const { id } = await params;
        if (isPreviewNotificationCandidate(request)) {
            if (!isPreviewNotificationId(id)) {
                return NextResponse.json({ error: "Invalid notification ID" }, { status: 400, headers: candidateHeaders });
            }
            try {
                await assertPreviewNotificationUser(userId);
                return NextResponse.json({ success: await markPreviewNotificationRead(userId, id) }, { headers: candidateHeaders });
            } catch (error) {
                console.error("[PREVIEW_NOTIFICATIONS] Mark unavailable", error);
                return NextResponse.json({ error: "Notifications unavailable" }, { status: 503, headers: candidateHeaders });
            }
        }
        const stored = await authNotificationResponse(request, userId, "notification", id);
        if (stored) return stored;

        const success = await markNotificationRead(userId, id);

        return NextResponse.json({ success });
    } catch (error) {
        return handleApiError(error, "notification-mark-read");
    }
}

// DELETE /api/notifications/[id] - Delete notification
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();

        if (!userId) {
            const denied = Errors.unauthorized();
            denied.headers.set("Cache-Control", "private, no-store");
            denied.headers.set("Vary", "Cookie");
            return denied;
        }

        const { id } = await params;
        if (isPreviewNotificationCandidate(request)) {
            if (!isPreviewNotificationId(id)) {
                return NextResponse.json({ error: "Invalid notification ID" }, { status: 400, headers: candidateHeaders });
            }
            try {
                await assertPreviewNotificationUser(userId);
                return NextResponse.json({ success: await deletePreviewNotification(userId, id) }, { headers: candidateHeaders });
            } catch (error) {
                console.error("[PREVIEW_NOTIFICATIONS] Delete unavailable", error);
                return NextResponse.json({ error: "Notifications unavailable" }, { status: 503, headers: candidateHeaders });
            }
        }
        const stored = await authNotificationResponse(request, userId, "notification", id);
        if (stored) return stored;

        const success = await deleteNotification(userId, id);

        return NextResponse.json({ success });
    } catch (error) {
        return handleApiError(error, "notification-delete");
    }
}
