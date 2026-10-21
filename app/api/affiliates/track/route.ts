import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimiters } from "@/lib/rate-limit";
import { clickIp, clickUserAgent, hashIP, parseAffiliateClick, type AffiliateClick } from "@/lib/affiliate-click";
import { isPreviewAffiliateClickCandidate, recordPreviewAffiliateClick } from "@/lib/app-data/preview-affiliate-clicks";

const candidateHeaders = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };

/** Writes to D1 on the exact preview candidate, otherwise to the Source table. Returns the data source used. */
async function recordClick(req: NextRequest, userId: string | null, click: AffiliateClick): Promise<"d1" | "source"> {
    const meta = { userAgent: clickUserAgent(req), ipHash: hashIP(clickIp(req)) };
    if (isPreviewAffiliateClickCandidate(req)) {
        if (!userId) throw new Error("Candidate click requires a signed-in owner");
        await recordPreviewAffiliateClick(userId, click, meta);
        return "d1";
    }
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("affiliate_clicks").insert({
        clerk_user_id: userId,
        partner: click.partner,
        tracking_id: click.trackingId,
        event_type: click.eventType,
        activity_name: click.activityName,
        affiliate_url: click.affiliateUrl,
        user_agent: meta.userAgent,
        ip_hash: meta.ipHash,
        created_at: new Date().toISOString(),
    });
    if (error) console.error("Failed to log affiliate click:", error);
    return "source";
}

export async function POST(req: NextRequest) {
    const limited = await rateLimiters.relaxed(req);
    if (limited) return limited;
    try {
        const { userId } = await auth();
        const body = await req.json().catch(() => null);
        const click = body && typeof body === "object" ? parseAffiliateClick(body) : null;

        if (!click) {
            return NextResponse.json(
                { error: "Missing or invalid fields" },
                { status: 400 }
            );
        }
        if (isPreviewAffiliateClickCandidate(req) && !userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: candidateHeaders });
        }

        const source = await recordClick(req, userId ?? null, click);
        return NextResponse.json({ success: true }, source === "d1" ? { headers: candidateHeaders } : undefined);
    } catch (error) {
        console.error("Affiliate tracking error:", error);
        // Return success anyway - we don't want tracking to break the UX
        return NextResponse.json({ success: true });
    }
}

/**
 * GET endpoint for pixel tracking (used in emails, etc.)
 */
export async function GET(req: NextRequest) {
    const limited = await rateLimiters.relaxed(req);
    if (limited) return limited;
    const { searchParams } = new URL(req.url);
    const click = parseAffiliateClick({
        partner: searchParams.get("partner"),
        trackingId: searchParams.get("tid"),
        eventType: searchParams.get("event") || "view",
    });
    let source: "d1" | "source" | null = null;

    if (click) {
        try {
            const { userId } = await auth();
            if (!isPreviewAffiliateClickCandidate(req) || userId) source = await recordClick(req, userId ?? null, click);
        } catch (error) {
            console.error("Affiliate pixel error:", error);
        }
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
            ...(source === "d1" ? { "X-Localley-Data-Source": "d1-preview" } : {}),
        },
    });
}
