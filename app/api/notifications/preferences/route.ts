import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
    getNotificationPreferences,
    updateNotificationPreferences,
} from "@/lib/notifications";

// GET /api/notifications/preferences - Get notification preferences
export async function GET() {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const preferences = await getNotificationPreferences(userId);

    if (!preferences) {
        return NextResponse.json({ error: "Failed to get preferences" }, { status: 500 });
    }

    return NextResponse.json(preferences);
}

// PATCH /api/notifications/preferences - Update notification preferences
export async function PATCH(request: NextRequest) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updates = await request.json();
    const preferences = await updateNotificationPreferences(userId, updates);

    if (!preferences) {
        return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
    }

    return NextResponse.json(preferences);
}
