import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import {
    NotificationStorageUnavailableError,
    getNotificationPreferences,
    updateNotificationPreferences,
} from "@/lib/notifications";
import { Errors, handleApiError } from "@/lib/api-errors";
import { assertPreviewNotificationUser, isPreviewNotificationCandidate } from "@/lib/app-data/preview-notifications";
import { parsePreviewNotificationPreferencePatch, previewNotificationPreferences,
    updatePreviewNotificationPreferences } from "@/lib/app-data/preview-notification-preferences";

const candidateHeaders = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };

async function boundedCandidateBody(request: NextRequest): Promise<string | null> {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > 8192) { await reader.cancel(); return null; }
            chunks.push(next.value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
        catch { return null; }
    } finally { reader.releaseLock(); }
}

// GET /api/notifications/preferences - Get notification preferences
export async function GET(request?: NextRequest) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        if (request && isPreviewNotificationCandidate(request)) {
            try {
                await assertPreviewNotificationUser(userId);
                return NextResponse.json(await previewNotificationPreferences(userId), { headers: candidateHeaders });
            } catch {
                return NextResponse.json({ available: false, preferences: null,
                    message: "Preview notification settings are unavailable." }, { status: 503, headers: candidateHeaders });
            }
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

        if (isPreviewNotificationCandidate(request)) {
            try {
                await assertPreviewNotificationUser(userId);
                const body = await boundedCandidateBody(request);
                if (body === null) {
                    return NextResponse.json({ error: "Invalid notification preferences" }, { status: 400, headers: candidateHeaders });
                }
                let value: unknown;
                try { value = JSON.parse(body); }
                catch { return NextResponse.json({ error: "Invalid notification preferences" }, { status: 400, headers: candidateHeaders }); }
                const patch = parsePreviewNotificationPreferencePatch(value);
                if (!patch) return NextResponse.json({ error: "Invalid notification preferences" }, { status: 400, headers: candidateHeaders });
                return NextResponse.json(await updatePreviewNotificationPreferences(userId, patch), { headers: candidateHeaders });
            } catch {
                return NextResponse.json({ error: "notifications_unavailable",
                    message: "Preview notification settings are unavailable." }, { status: 503, headers: candidateHeaders });
            }
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
