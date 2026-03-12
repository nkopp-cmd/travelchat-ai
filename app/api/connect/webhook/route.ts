import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

/**
 * POST /api/connect/webhook
 *
 * Handles Stripe Connect webhook events:
 * - account.updated: Guide completes onboarding or account status changes
 * - transfer.created: Payout transfer initiated
 * - transfer.updated: Transfer status changed (check for completion)
 * - transfer.reversed: Payout reversed/failed
 */
export async function POST(req: NextRequest) {
    if (!stripe || !webhookSecret) {
        return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }

    try {
        const body = await req.text();
        const headersList = await headers();
        const signature = headersList.get("stripe-signature");

        if (!signature) {
            return NextResponse.json({ error: "Missing signature" }, { status: 400 });
        }

        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        } catch {
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        const supabase = createSupabaseAdmin();
        const eventType = event.type as string;

        if (eventType === "account.updated") {
            const account = event.data.object as Stripe.Account;
            await handleAccountUpdated(supabase, account);
        } else if (eventType === "transfer.created" || eventType === "transfer.updated") {
            // Transfer status changes (created → pending → paid)
            // Check if the transfer object indicates completion
            const transfer = event.data.object as Stripe.Transfer;
            if (transfer.reversed === false && transfer.amount > 0) {
                await handleTransferPaid(supabase, transfer);
            }
        } else if (eventType === "transfer.reversed") {
            const transfer = event.data.object as Stripe.Transfer;
            await handleTransferFailed(supabase, transfer);
        } else {
            console.log(`[Connect Webhook] Unhandled event: ${eventType}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error("Connect webhook error:", error);
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
    }
}

/**
 * Handle account.updated — fires when a guide completes onboarding
 * or when their account status changes.
 */
async function handleAccountUpdated(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    account: Stripe.Account
) {
    const { error } = await supabase
        .from("guide_profiles")
        .update({
            stripe_onboarding_complete: account.details_submitted ?? false,
            stripe_charges_enabled: account.charges_enabled ?? false,
            stripe_payouts_enabled: account.payouts_enabled ?? false,
        })
        .eq("stripe_account_id", account.id);

    if (error) {
        console.error(`[Connect Webhook] Failed to update guide profile for ${account.id}:`, error);
    } else {
        console.log(`[Connect Webhook] Account updated: ${account.id} (payouts: ${account.payouts_enabled})`);
    }
}

/**
 * Handle transfer.paid — payout successfully delivered to guide.
 */
async function handleTransferPaid(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    transfer: Stripe.Transfer
) {
    const earningId = transfer.metadata?.earning_id;
    if (!earningId) return;

    const { error } = await supabase
        .from("guide_earnings")
        .update({
            status: "paid",
            paid_at: new Date().toISOString(),
        })
        .eq("id", earningId);

    if (error) {
        console.error(`[Connect Webhook] Failed to mark earning ${earningId} as paid:`, error);
    }

    // Update guide's total_paid_out
    const guideUserId = transfer.metadata?.guide_clerk_user_id;
    if (guideUserId) {
        const amountDollars = transfer.amount / 100;
        await supabase.rpc("increment_guide_paid_out", {
            p_clerk_user_id: guideUserId,
            p_amount: amountDollars,
        }).catch(() => {
            // Fallback: manual update
            supabase
                .from("guide_profiles")
                .select("total_paid_out, pending_balance")
                .eq("clerk_user_id", guideUserId)
                .single()
                .then(({ data }) => {
                    if (data) {
                        supabase.from("guide_profiles").update({
                            total_paid_out: (parseFloat(data.total_paid_out) || 0) + amountDollars,
                            pending_balance: Math.max(0, (parseFloat(data.pending_balance) || 0) - amountDollars),
                        }).eq("clerk_user_id", guideUserId);
                    }
                });
        });
    }

    console.log(`[Connect Webhook] Transfer paid: ${transfer.id} ($${transfer.amount / 100})`);
}

/**
 * Handle transfer.failed — payout failed, mark earning for retry.
 */
async function handleTransferFailed(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    transfer: Stripe.Transfer
) {
    const earningId = transfer.metadata?.earning_id;
    if (!earningId) return;

    await supabase
        .from("guide_earnings")
        .update({ status: "failed" })
        .eq("id", earningId);

    console.error(`[Connect Webhook] Transfer failed: ${transfer.id}`);
}
