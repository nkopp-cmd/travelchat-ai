import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription, removePushSubscription } from "@/lib/notifications";
import { Errors, handleApiError } from "@/lib/api-errors";

// POST /api/notifications/push/subscribe - Save push subscription
export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await request.json();

        if (!body.subscription) {
            return Errors.validationError("Missing subscription");
        }

        const { endpoint, keys } = body.subscription;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return Errors.validationError("Invalid subscription format");
        }

        const success = await savePushSubscription(userId, {
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            userAgent: request.headers.get("user-agent") || undefined,
        });

        return NextResponse.json({ success });
    } catch (error) {
        return handleApiError(error, "push-subscribe");
    }
}

// DELETE /api/notifications/push/subscribe - Remove push subscription
export async function DELETE(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const body = await request.json();

        if (!body.endpoint) {
            return Errors.validationError("Missing endpoint");
        }

        const success = await removePushSubscription(userId, body.endpoint);

        return NextResponse.json({ success });
    } catch (error) {
        return handleApiError(error, "push-unsubscribe");
    }
}
