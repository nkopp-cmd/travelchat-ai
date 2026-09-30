import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getUserTier } from "@/lib/usage-tracking";
import { isPreviewBillingStatusCandidate } from "@/lib/app-data/preview-billing-status";
import { previewUserTier } from "@/lib/app-data/preview-user-tier";

export async function GET(request: NextRequest) {
    if (isPreviewBillingStatusCandidate(request)) {
        const headers = { "Cache-Control": "private, no-store", "X-Localley-Data-Source": "d1-preview" };
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
        try {
            return NextResponse.json({ tier: await previewUserTier(userId) }, { headers });
        } catch {
            return NextResponse.json({ error: "Preview tier unavailable" }, { status: 503, headers });
        }
    }
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ tier: "free" });
        }

        const tier = await getUserTier(userId);
        return NextResponse.json({ tier });
    } catch (error) {
        console.error("[USER_TIER] Error:", error);
        return NextResponse.json({ tier: "free" });
    }
}
