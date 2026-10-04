import { hasPreviewGuideIntent } from "@/lib/app-data/preview-guide-intent";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { approvePreviewPayouts, isPreviewPayoutApprovalCandidate,
    parsePayoutApproval, PreviewPayoutMissing } from "@/lib/app-data/preview-payout-approval";

/**
 * POST /api/admin/payouts/approve
 *
 * Admin-only: Approve calculated earnings for payout.
 * Body: { month: "2026-03-01" } or { earningIds: ["uuid1", "uuid2"] }
 *
 * Changes status from "calculated" to "approved".
 */
export async function POST(req: NextRequest) {
    const adminCheck = await requireAdmin("/api/admin/payouts/approve", "approve_payouts");
    if (adminCheck.response) return adminCheck.response;

    if (isPreviewPayoutApprovalCandidate(req)) {
        const headers = { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" };
        try {
            const raw = await req.text();
            if (raw.length > 8192) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
            let body: unknown;
            try { body = JSON.parse(raw); } catch { body = null; }
            const scope = parsePayoutApproval(body);
            if (!scope) return NextResponse.json({ error: "Provide a valid month or earningIds" }, { status: 400, headers });
            return NextResponse.json({ approved: await approvePreviewPayouts(scope, adminCheck.userId) }, { headers });
        } catch (error) {
            if (error instanceof PreviewPayoutMissing) {
                return NextResponse.json({ error: "Earning not found" }, { status: 404, headers });
            }
            console.error("[PREVIEW_PAYOUT_APPROVAL] Approval unavailable", error);
            return NextResponse.json({ error: "Payout approval unavailable" }, { status: 503, headers });
        }
    }

    // Explicit candidate intent cannot fall through when safety settings are unavailable.
    if (hasPreviewGuideIntent(req)) {
        return NextResponse.json({ error: "Payout approval unavailable" }, {
            status: 503,
            headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" },
        });
    }

    try {
        const body = await req.json();
        const supabase = createSupabaseAdmin();

        let query = supabase
            .from("guide_earnings")
            .update({ status: "approved" })
            .eq("status", "calculated");

        if (body.earningIds?.length) {
            query = query.in("id", body.earningIds);
        } else if (body.month) {
            query = query.eq("earning_month", body.month);
        } else {
            return NextResponse.json({ error: "Provide month or earningIds" }, { status: 400 });
        }

        const { error, count } = await query.select("id");
        if (error) {
            return NextResponse.json({ error: "Failed to approve", details: error.message }, { status: 500 });
        }

        return NextResponse.json({ approved: count || 0 });
    } catch (error) {
        console.error("Payout approval error:", error);
        return NextResponse.json({ error: "Failed to approve payouts" }, { status: 500 });
    }
}
