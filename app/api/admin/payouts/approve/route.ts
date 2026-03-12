import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";

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
