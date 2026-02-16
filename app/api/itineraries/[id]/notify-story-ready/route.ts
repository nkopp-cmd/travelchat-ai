import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { StoryReadyEmail } from "@/emails/story-ready-email";
import { Errors, handleApiError } from "@/lib/api-errors";

/**
 * POST /api/itineraries/[id]/notify-story-ready
 * Send an email notification when story slides are ready
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        // Get user email from Clerk
        const user = await currentUser();
        const email = user?.emailAddresses?.[0]?.emailAddress;
        const firstName = user?.firstName;

        if (!email) {
            console.log("[NOTIFY_STORY] No email found for user, skipping");
            return NextResponse.json({ success: true, sent: false, reason: "no_email" });
        }

        const itineraryUrl = `https://www.localley.io/itineraries/${id}`;

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
