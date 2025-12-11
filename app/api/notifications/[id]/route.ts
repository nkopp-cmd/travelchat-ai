import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { markNotificationRead, deleteNotification } from "@/lib/notifications";

// PATCH /api/notifications/[id] - Mark notification as read
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const success = await markNotificationRead(userId, id);

    return NextResponse.json({ success });
}

// DELETE /api/notifications/[id] - Delete notification
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const success = await deleteNotification(userId, id);

    return NextResponse.json({ success });
}
