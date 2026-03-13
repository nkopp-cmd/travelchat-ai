import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { createTransfer } from "@/lib/stripe-connect";

/**
 * POST /api/admin/payouts/execute
 *
 * Admin-only: Execute approved payouts via Stripe Connect transfers.
 * Body: { month?: "2026-03-01", earningIds?: string[] }
 *
 * Only processes earnings with status "approved".
 * Admin must first calculate (POST /api/admin/payouts/calculate),
 * then approve earnings, then execute.
 */
export async function POST(req: NextRequest) {
    const adminCheck = await requireAdmin("/api/admin/payouts/execute", "execute_payouts");
    if (adminCheck.response) return adminCheck.response;

    try {
        const body = await req.json().catch(() => ({}));
        const supabase = createSupabaseAdmin();

        // Build query for approved earnings
        let query = supabase
            .from("guide_earnings")
            .select("*, guide_profiles!inner(stripe_account_id, stripe_payouts_enabled)")
            .eq("status", "approved");

        if (body.earningIds?.length) {
            query = query.in("id", body.earningIds);
        } else if (body.month) {
            query = query.eq("earning_month", body.month);
        } else {
            return NextResponse.json({ error: "Provide month or earningIds" }, { status: 400 });
        }

        const { data: earnings, error } = await query;
        if (error) {
            return NextResponse.json({ error: "Failed to fetch earnings", details: error.message }, { status: 500 });
        }

        if (!earnings?.length) {
            return NextResponse.json({ message: "No approved earnings to process", processed: 0 });
        }

        const results: Array<{
            earningId: string;
            guideUserId: string;
            amount: number;
            status: "processing" | "failed";
            transferId?: string;
            error?: string;
        }> = [];

        for (const earning of earnings) {
            const guide = (earning as Record<string, unknown>).guide_profiles as {
                stripe_account_id: string | null;
                stripe_payouts_enabled: boolean;
            };

            if (!guide?.stripe_account_id || !guide.stripe_payouts_enabled) {
                results.push({
                    earningId: earning.id,
                    guideUserId: earning.guide_clerk_user_id,
                    amount: earning.gross_amount,
                    status: "failed",
                    error: "Stripe account not ready for payouts",
                });

                await supabase
                    .from("guide_earnings")
                    .update({ status: "failed" })
                    .eq("id", earning.id);

                continue;
            }

            try {
                const amountCents = Math.round(earning.gross_amount * 100);
                if (amountCents <= 0) continue;

                const transfer = await createTransfer(
                    guide.stripe_account_id,
                    amountCents,
                    `Localley guide earnings for ${earning.earning_month}`,
                    {
                        earning_id: earning.id,
                        guide_clerk_user_id: earning.guide_clerk_user_id,
                        earning_month: earning.earning_month,
                    }
                );

                if (transfer) {
                    await supabase
                        .from("guide_earnings")
                        .update({
                            status: "processing",
                            stripe_transfer_id: transfer.id,
                            stripe_fee: 0, // Stripe Connect doesn't charge per-transfer fees for Express
                            net_amount: earning.gross_amount,
                        })
                        .eq("id", earning.id)
                        .eq("status", "approved");

                    results.push({
                        earningId: earning.id,
                        guideUserId: earning.guide_clerk_user_id,
                        amount: earning.gross_amount,
                        status: "processing",
                        transferId: transfer.id,
                    });
                } else {
                    throw new Error("Transfer returned null");
                }
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";

                await supabase
                    .from("guide_earnings")
                    .update({ status: "failed" })
                    .eq("id", earning.id);

                results.push({
                    earningId: earning.id,
                    guideUserId: earning.guide_clerk_user_id,
                    amount: earning.gross_amount,
                    status: "failed",
                    error: errorMessage,
                });
            }
        }

        const processing = results.filter((r) => r.status === "processing");
        const failed = results.filter((r) => r.status === "failed");

        return NextResponse.json({
            processed: results.length,
            processing: processing.length,
            failed: failed.length,
            totalInitiated: processing.reduce((sum, r) => sum + r.amount, 0),
            results,
        });
    } catch (error) {
        console.error("Payout execution error:", error);
        return NextResponse.json({ error: "Failed to execute payouts" }, { status: 500 });
    }
}
