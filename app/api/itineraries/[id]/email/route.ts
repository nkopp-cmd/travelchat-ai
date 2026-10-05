import { NextRequest, NextResponse } from "next/server";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { queuePreviewItineraryMail } from "@/lib/app-data/preview-itinerary-mail";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { ItineraryEmail } from "@/emails/itinerary-email";
import { Errors, handleApiError, apiError, ErrorCodes } from "@/lib/api-errors";
import {
    normalizeDailyPlansForDisplay,
    parseDailyPlans,
} from "@/lib/itineraries/normalize-daily-plans";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (isPreviewStoryCandidate(req)) {
        const headers = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };
        try {
            const { userId } = await auth();
            if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
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
            let value: unknown;
            try { value = JSON.parse(new TextDecoder().decode(bytes)); }
            catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers }); }
            if (!value || typeof value !== "object" || Array.isArray(value)
                || !("recipientEmail" in value) || typeof value.recipientEmail !== "string"
                || !value.recipientEmail || value.recipientEmail.length > 200
                || Object.entries(value).some(([key, v]) => !["recipientEmail", "recipientName"].includes(key)
                    || typeof v !== "string" || v.length > (key === "recipientName" ? 100 : 200)
                    || /[\x00-\x1f\x7f]/.test(v))) {
                return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
            }
            const { id } = await params;
            const queued = await queuePreviewItineraryMail(userId, id, value.recipientEmail);
            return NextResponse.json(queued ? { success: true, sent: false, queued: true, reason: "preview_outbox" }
                : { error: "Not found" }, { status: queued ? 200 : 404, headers });
        } catch (error) {
            return NextResponse.json({ error: error instanceof RangeError ? "Invalid request" : "Itinerary mail unavailable" },
                { status: error instanceof RangeError ? 400 : 503, headers });
        }
    }
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
        const { recipientEmail, recipientName } = await req.json();

        if (!recipientEmail) {
            return Errors.validationError("Recipient email is required");
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipientEmail)) {
            return Errors.validationError("Invalid email format");
        }

        const supabase = await createSupabaseServerClient();

        // Fetch the itinerary
        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .eq("clerk_user_id", userId)
            .single();

        if (error || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        const { dailyPlans, insights } = normalizeDailyPlansForDisplay<{
            day: number;
            theme?: string;
            activities: Array<{
                name: string;
                description: string;
                time?: string;
                localleyScore?: number;
            }>;
        }>(parseDailyPlans(itinerary.activities));

        // Transform activities to email format
        const days = dailyPlans.map((dayPlan) => ({
            day: `Day ${dayPlan.day}${dayPlan.theme ? `: ${dayPlan.theme}` : ""}`,
            activities: (dayPlan.activities || []).map((activity) => ({
                title: activity.name,
                description: activity.description,
                time: activity.time,
                type: activity.localleyScore && activity.localleyScore >= 5
                    ? "hidden-gem"
                    : activity.localleyScore && activity.localleyScore >= 4
                        ? "local-favorite"
                        : "mixed",
            })),
        })) satisfies Parameters<typeof ItineraryEmail>[0]["days"];

        // Generate share URL if itinerary is shared
        const shareUrl = itinerary.share_code
            ? `${req.nextUrl.origin}/shared/${itinerary.share_code}`
            : `${req.nextUrl.origin}/itineraries/${id}`;

        // Check if Resend is configured
        if (!resend) {
            return apiError(ErrorCodes.EXTERNAL_SERVICE_ERROR, "Email service not configured");
        }

        // Send the email
        const { data: emailData, error: emailError } = await resend.emails.send({
            from: FROM_EMAIL,
            to: recipientEmail,
            subject: `Your ${itinerary.city} Itinerary from Localley`,
            react: ItineraryEmail({
                itineraryTitle: itinerary.title,
                city: itinerary.city,
                days,
                recipientName,
                shareUrl,
                highlights: itinerary.highlights,
                insights,
            }),
        });

        if (emailError) {
            console.error("Email send error:", emailError);
            return Errors.externalServiceError("email");
        }

        // Award XP for sharing (fire and forget)
        try {
            await fetch(`${req.nextUrl.origin}/api/gamification/award`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Cookie": req.headers.get("cookie") || "",
                },
                body: JSON.stringify({
                    action: "share_spot",
                }),
            });
        } catch (xpError) {
            console.error("Error awarding XP:", xpError);
        }

        return NextResponse.json({
            success: true,
            message: "Itinerary sent successfully",
            emailId: emailData?.id,
        });
    } catch (error) {
        return handleApiError(error, "itinerary-email");
    }
}
