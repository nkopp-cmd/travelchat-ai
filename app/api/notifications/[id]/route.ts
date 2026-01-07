import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { markNotificationRead, deleteNotification } from "@/lib/notifications";
import { Errors, handleApiError } from "@/lib/api-errors";

// PATCH /api/notifications/[id] - Mark notification as read
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
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
            return Errors.unauthorized();
        }

        const { id } = await params;
        const success = await deleteNotification(userId, id);

        return NextResponse.json({ success });
    } catch (error) {
        return handleApiError(error, "notification-delete");
    }
}
