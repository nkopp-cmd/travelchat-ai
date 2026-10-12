import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendStoryReadyEmail } from "@/lib/story-mail";
import { authMailMode } from "@/lib/auth/mail";
import { reserveItineraryMail } from "@/lib/itinerary-mail-limit";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { queuePreviewStoryMail } from "@/lib/app-data/preview-story-mail";

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
    const headers = { "Cache-Control": "private, no-store" };
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
        const user = await currentUser();
        const email = user?.primaryEmailAddress?.emailAddress;
        if (user?.id !== userId || !user.emailVerified || !email || email.length > 200) {
            return NextResponse.json({ error: "Verified email required" }, { status: 403, headers });
        }
        const { id } = await params;
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
            return NextResponse.json({ error: "Invalid itinerary" }, { status: 400, headers });
        }
        // Retain the existing city-only caller contract; never use its content in mail.
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
        try { value = JSON.parse(body); } catch {
            return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
        }
        if (!value || typeof value !== "object" || Array.isArray(value)
            || Object.entries(value).some(([key, v]) => key !== "city" || typeof v !== "string"
                || v.length > 100 || /[\x00-\x1f\x7f]/.test(v))) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
        }
        const supabase = await createSupabaseServerClient();
        const { data: trip, error } = await supabase.from("itineraries").select("*")
            .eq("id", id.toLowerCase()).eq("clerk_user_id", userId).single();
        if (error && error.code !== "PGRST116") throw new Error("Story lookup unavailable");
        if (!trip || trip.id !== id.toLowerCase() || trip.clerk_user_id !== userId) {
            return NextResponse.json({ error: "Not found" }, { status: 404, headers });
        }
        const raw = trip.story_slides;
        const slides = raw && typeof raw === "object" && !Array.isArray(raw)
            ? (raw.slides && typeof raw.slides === "object" ? raw.slides : raw) : null;
        if (!slides || !Object.entries(slides).some(([key, url]) =>
            /^(cover|day[1-9]\d?|summary)$/.test(key) && typeof url === "string" && url.startsWith("https://"))) {
            return NextResponse.json({ success: true, sent: false, reason: "stories_not_ready" }, { headers });
        }
        if (authMailMode() !== "outbox") {
            const limit = await reserveItineraryMail(userId);
            if (limit === "limited") return NextResponse.json({ error: "Email limit reached" }, { status: 429, headers });
            if (limit !== "allowed") throw new Error("Story mail limit unavailable");
        }
        const result = await sendStoryReadyEmail(email, `https://localley.io/itineraries/${trip.id}/stories`);
        return NextResponse.json({ success: true, ...result }, { headers });
    } catch {
        // No retry, recipient/address logging, or false delivery claim on suppression/unknown failure.
        return NextResponse.json({ success: true, sent: false, reason: "send_failed" }, { status: 503, headers });
    }
}
