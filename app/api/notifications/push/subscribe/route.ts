import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription, removePushSubscription } from "@/lib/notifications";

// POST /api/notifications/push/subscribe - Save push subscription
export async function POST(request: NextRequest) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.subscription) {
        return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
    }

    const { endpoint, keys } = body.subscription;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return NextResponse.json({ error: "Invalid subscription format" }, { status: 400 });
    }

    const success = await savePushSubscription(userId, {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: request.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({ success });
}

// DELETE /api/notifications/push/subscribe - Remove push subscription
export async function DELETE(request: NextRequest) {
    const { userId } = await auth();

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.endpoint) {
        return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    const success = await removePushSubscription(userId, body.endpoint);

    return NextResponse.json({ success });
}
