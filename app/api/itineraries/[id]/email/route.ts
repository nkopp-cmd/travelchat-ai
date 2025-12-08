import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { ItineraryEmail } from "@/emails/itinerary-email";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const { recipientEmail, recipientName } = await req.json();

        if (!recipientEmail) {
            return NextResponse.json(
                { error: "Recipient email is required" },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipientEmail)) {
            return NextResponse.json(
                { error: "Invalid email format" },
                { status: 400 }
            );
        }

        const supabase = createSupabaseAdmin();

        // Fetch the itinerary
        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .eq("clerk_user_id", userId)
            .single();

        if (error || !itinerary) {
            return NextResponse.json(
                { error: "Itinerary not found" },
                { status: 404 }
            );
        }

        // Transform activities to email format
        const days = (itinerary.activities || []).map((dayPlan: {
            day: number;
            theme?: string;
            activities: Array<{
                name: string;
                description: string;
                time?: string;
                localleyScore?: number;
            }>;
            localTip?: string;
        }) => ({
            day: `Day ${dayPlan.day}${dayPlan.theme ? `: ${dayPlan.theme}` : ""}`,
            activities: (dayPlan.activities || []).map((activity) => ({
                title: activity.name,
                description: activity.description,
                time: activity.time,
                type: activity.localleyScore && activity.localleyScore >= 5
                    ? "hidden-gem"
                    : activity.localleyScore && activity.localleyScore >= 4
                        ? "local-favorite"
                        : "mixed" as const,
            })),
            localTip: dayPlan.localTip,
        }));

        // Generate share URL if itinerary is shared
        const shareUrl = itinerary.share_code
            ? `${req.nextUrl.origin}/shared/${itinerary.share_code}`
            : `${req.nextUrl.origin}/itineraries/${id}`;

        // Check if Resend is configured
        if (!resend) {
            return NextResponse.json(
                { error: "Email service not configured" },
                { status: 503 }
            );
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
            }),
        });

        if (emailError) {
            console.error("Email send error:", emailError);
            return NextResponse.json(
                { error: "Failed to send email" },
                { status: 500 }
            );
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
        console.error("Email itinerary error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
