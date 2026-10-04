import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/auth/server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { StoryReadyEmail } from "@/emails/story-ready-email";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { queuePreviewStoryMail } from "@/lib/app-data/preview-story-mail";
import { Errors } from "@/lib/api-errors";

/**
 * POST /api/itineraries/[id]/notify-story-ready
 * Send an email notification when story slides are ready
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (isPreviewStoryCandidate(req)) {
        const headers = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };
        try {
            const { userId } = await auth();
            if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
            // City remains accepted for the existing caller, but never controls mail content.
            const reader = req.body?.getReader();
            if (!reader) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                while (true) {
                    const part = await reader.read();
                    if (part.done) break;
                    size += part.value.byteLength;
                    if (size > 512) {
                        await reader.cancel();
                        return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
                    }
                    chunks.push(part.value);
                }
            } finally { reader.releaseLock(); }
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
            const body = new TextDecoder().decode(bytes);
            let value: unknown;
            try { value = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers }); }
            if (!value || typeof value !== "object" || Array.isArray(value)
                || Object.entries(value).some(([key, v]) => key !== "city" || typeof v !== "string"
                    || v.length > 100 || /[\x00-\x1f\x7f]/.test(v))) {
                return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
            }
            const { id } = await params;
            const queued = await queuePreviewStoryMail(userId, id);
            return NextResponse.json(queued ? { success: true, sent: false, queued: true, reason: "preview_outbox" }
                : { error: "Not found" }, { status: queued ? 200 : 404, headers });
        } catch (error) {
            return NextResponse.json({ error: error instanceof RangeError ? "Invalid request" : "Story mail unavailable" },
                { status: error instanceof RangeError ? 400 : 503, headers });
        }
    }
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        if (!resend) {
            console.log("[NOTIFY_STORY] Resend not configured, skipping email");
            return NextResponse.json({ success: true, sent: false, reason: "email_not_configured" });
        }

        const { id } = await params;
        const { city } = await req.json();

        // Get user email from the auth session
        const user = await currentUser();
        const email = user?.emailAddresses?.[0]?.emailAddress;
        const firstName = user?.firstName;

        if (!email) {
            console.log("[NOTIFY_STORY] No email found for user, skipping");
            return NextResponse.json({ success: true, sent: false, reason: "no_email" });
        }

        const itineraryUrl = `https://localley.io/itineraries/${id}/stories`;

        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: `Your ${city || "travel"} story slides are ready!`,
            react: StoryReadyEmail({
                city: city || "your trip",
                itineraryUrl,
                recipientName: firstName || undefined,
            }),
        });

        if (error) {
            console.error("[NOTIFY_STORY] Email send error:", error);
            return NextResponse.json({ success: true, sent: false, reason: "send_failed" });
        }

        console.log("[NOTIFY_STORY] Email sent successfully:", data?.id);
        return NextResponse.json({ success: true, sent: true, emailId: data?.id });
    } catch (error) {
        console.error("[NOTIFY_STORY] Error:", error);
        // Don't fail the request if email notification fails
        return NextResponse.json({ success: true, sent: false, reason: "error" });
    }
}
