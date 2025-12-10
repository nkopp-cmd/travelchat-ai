import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        const body = await req.json();

        const {
            partner,
            trackingId,
            eventType,
            activityName,
            url,
        } = body;

        if (!partner || !trackingId || !eventType) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const supabase = createSupabaseAdmin();

        // Log the affiliate click/event
        const { error } = await supabase.from("affiliate_clicks").insert({
            clerk_user_id: userId || null, // Can be null for anonymous users
            partner,
            tracking_id: trackingId,
            event_type: eventType,
            activity_name: activityName || null,
            affiliate_url: url || null,
            user_agent: req.headers.get("user-agent") || null,
            ip_hash: hashIP(req.headers.get("x-forwarded-for") || "unknown"),
            created_at: new Date().toISOString(),
        });

        if (error) {
            console.error("Failed to log affiliate click:", error);
            // Don't fail the request, just log the error
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Affiliate tracking error:", error);
        // Return success anyway - we don't want tracking to break the UX
        return NextResponse.json({ success: true });
    }
}

/**
 * Hash IP for privacy - we only need it for fraud detection
 */
function hashIP(ip: string): string {
    // Simple hash for privacy - in production use a proper hashing library
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
        const char = ip.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

/**
 * GET endpoint for pixel tracking (used in emails, etc.)
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const partner = searchParams.get("partner");
    const trackingId = searchParams.get("tid");
    const eventType = searchParams.get("event") || "view";

    if (partner && trackingId) {
        const supabase = createSupabaseAdmin();

        await supabase.from("affiliate_clicks").insert({
            partner,
            tracking_id: trackingId,
            event_type: eventType,
            user_agent: req.headers.get("user-agent") || null,
            ip_hash: hashIP(req.headers.get("x-forwarded-for") || "unknown"),
            created_at: new Date().toISOString(),
        });
    }

    // Return a 1x1 transparent pixel
    const pixel = Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64"
    );

    return new NextResponse(pixel, {
        headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    });
}
