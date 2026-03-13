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
 * - transfer.created: Payout transfer created by the platform
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
        } else if (eventType === "transfer.created") {
            const transfer = event.data.object as Stripe.Transfer;
            await handleTransferCreated(supabase, transfer);
        } else if (eventType === "transfer.reversed") {
            const transfer = event.data.object as Stripe.Transfer;
            await handleTransferReversed(supabase, transfer);
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
 * Handle transfer.created. We treat a created transfer as the platform having
 * successfully moved funds to the connected account balance.
 */
async function handleTransferCreated(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    transfer: Stripe.Transfer
) {
    const earningId = transfer.metadata?.earning_id;
    if (!earningId) return;

    const { data: earning, error: fetchError } = await supabase
        .from("guide_earnings")
        .select("id, status, stripe_transfer_id, paid_at")
        .eq("id", earningId)
        .single();

    if (fetchError || !earning) {
        console.error(`[Connect Webhook] Failed to fetch earning ${earningId}:`, fetchError);
        return;
    }

    if (earning.status === "paid" && earning.stripe_transfer_id === transfer.id) {
        return;
    }

    const { error } = await supabase
        .from("guide_earnings")
        .update({
            status: "paid",
            paid_at: earning.paid_at || new Date().toISOString(),
            stripe_transfer_id: earning.stripe_transfer_id || transfer.id,
        })
        .eq("id", earningId)
        .in("status", ["approved", "processing"]);

    if (error) {
        console.error(`[Connect Webhook] Failed to mark earning ${earningId} as paid:`, error);
        return;
    }

    console.log(`[Connect Webhook] Transfer created: ${transfer.id} ($${transfer.amount / 100})`);
}

/**
 * Handle transfer.reversed — payout failed or was reversed after transfer creation.
 */
async function handleTransferReversed(
    supabase: ReturnType<typeof createSupabaseAdmin>,
    transfer: Stripe.Transfer
) {
    const earningId = transfer.metadata?.earning_id;
    if (!earningId) return;

    const { data: earning, error: fetchError } = await supabase
        .from("guide_earnings")
        .select("id, status, stripe_transfer_id")
        .eq("id", earningId)
        .single();

    if (fetchError || !earning) {
        console.error(`[Connect Webhook] Failed to fetch earning ${earningId}:`, fetchError);
        return;
    }

    if (earning.stripe_transfer_id && earning.stripe_transfer_id !== transfer.id) {
        console.warn(`[Connect Webhook] Ignoring reversal for mismatched transfer on earning ${earningId}`);
        return;
    }

    const { error } = await supabase
        .from("guide_earnings")
        .update({
            status: "failed",
            paid_at: null,
            stripe_transfer_id: transfer.id,
        })
        .eq("id", earningId)
        .in("status", ["processing", "paid"]);

    if (error) {
        console.error(`[Connect Webhook] Failed to mark earning ${earningId} as reversed:`, error);
        return;
    }

    console.error(`[Connect Webhook] Transfer reversed: ${transfer.id}`);
}
