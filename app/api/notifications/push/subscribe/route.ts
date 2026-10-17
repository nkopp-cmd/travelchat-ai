import { authNotificationResponse } from "@/lib/notifications/auth-http";
import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { savePushSubscription, removePushSubscription } from "@/lib/notifications";
import { Errors, handleApiError } from "@/lib/api-errors";

import { assertPreviewNotificationUser, isPreviewNotificationCandidate } from "@/lib/app-data/preview-notifications";
import { parsePreviewPushEndpoint, parsePreviewPushSubscription, savePreviewPushSubscription,
    removePreviewPushSubscription } from "@/lib/app-data/preview-push-subscriptions";

const candidateHeaders = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };
async function candidate(request: NextRequest, userId: string, remove: boolean): Promise<NextResponse> {
    try {
        await assertPreviewNotificationUser(userId);
        const reader = request.body?.getReader();
        let value: unknown;
        if (!reader) return invalid();
        try {
            const chunks: Uint8Array[] = []; let length = 0;
            for (;;) {
                const next = await reader.read(); if (next.done) break;
                length += next.value.byteLength;
                if (length > 8192) { await reader.cancel(); return invalid(); }
                chunks.push(next.value);
            }
            const bytes = new Uint8Array(length); let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
            catch { return invalid(); }
        } finally { reader.releaseLock(); }
        if (remove) {
            if (!value || typeof value !== "object" || Array.isArray(value)
                || Object.keys(value).length !== 1 || !("endpoint" in value)) return invalid();
            const endpoint = parsePreviewPushEndpoint(value.endpoint);
            if (!endpoint) return invalid();
            await removePreviewPushSubscription(userId, endpoint);
        } else {
            const input = await parsePreviewPushSubscription(value);
            if (!input) return invalid();
            await savePreviewPushSubscription(userId, input);
        }
        return NextResponse.json({ success: true, deliveryEnabled: false }, { headers: candidateHeaders });
    } catch {
        return NextResponse.json({ success: false, deliveryEnabled: false, error: "push_storage_unavailable" },
            { status: 503, headers: candidateHeaders });
    }
}
function invalid(): NextResponse {
    return NextResponse.json({ success: false, deliveryEnabled: false, error: "invalid_subscription" },
        { status: 400, headers: candidateHeaders });
}

// POST /api/notifications/push/subscribe - Save push subscription
export async function POST(request: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        if (isPreviewNotificationCandidate(request)) return candidate(request, userId, false);

        const stored = await authNotificationResponse(request, userId, "push");
        if (stored) return stored;

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

        if (isPreviewNotificationCandidate(request)) return candidate(request, userId, true);

        const stored = await authNotificationResponse(request, userId, "push");
        if (stored) return stored;

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
