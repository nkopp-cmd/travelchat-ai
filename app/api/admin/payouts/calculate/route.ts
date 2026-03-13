import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";
import { STRIPE_PRICE_IDS, stripe } from "@/lib/stripe";

const LOCALLEY_PRICE_IDS = new Set(
    Object.values(STRIPE_PRICE_IDS)
        .flatMap((priceMap) => Object.values(priceMap))
        .filter(Boolean)
);

function isLocalleySubscriptionInvoice(invoice: Stripe.Invoice) {
    return (
        invoice.lines?.data?.some((line) => {
            const priceId = line.pricing?.price_details?.price;
            return !!priceId && LOCALLEY_PRICE_IDS.has(priceId);
        }) ?? false
    );
}

/**
 * POST /api/admin/payouts/calculate
 *
 * Admin-only: Calculate monthly earnings for all guides.
 * Body: { month?: "2026-03-01" } — defaults to previous month
 *
 * Steps:
 * 1. Get total subscription revenue for the month from Stripe
 * 2. Call the DB function to calculate each guide's share
 * 3. Return summary
 */
export async function POST(req: NextRequest) {
    const adminCheck = await requireAdmin("/api/admin/payouts/calculate", "calculate_payouts");
    if (adminCheck.response) return adminCheck.response;

    try {
        const body = await req.json().catch(() => ({}));

        // Default to previous month
        const now = new Date();
        const defaultMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const targetMonth = body.month
            ? new Date(body.month)
            : defaultMonth;

        const monthStr = targetMonth.toISOString().split("T")[0];

        // Get subscription revenue from Stripe for this month
        const monthStart = Math.floor(targetMonth.getTime() / 1000);
        const monthEnd = Math.floor(
            new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 1).getTime() / 1000
        );

        let subscriptionRevenue = 0;

        if (stripe) {
            // Sum all successful invoice payments for the month
            const invoices = await stripe.invoices.list({
                created: { gte: monthStart, lt: monthEnd },
                status: "paid",
                limit: 100,
            });

            for (const invoice of invoices.data) {
                if (!isLocalleySubscriptionInvoice(invoice)) continue;
                subscriptionRevenue += (invoice.amount_paid || 0) / 100; // Convert cents to dollars
            }

            // Paginate if more than 100
            let hasMore = invoices.has_more;
            let lastId = invoices.data[invoices.data.length - 1]?.id;
            while (hasMore && lastId) {
                const more = await stripe.invoices.list({
                    created: { gte: monthStart, lt: monthEnd },
                    status: "paid",
                    limit: 100,
                    starting_after: lastId,
                });
                for (const invoice of more.data) {
                    if (!isLocalleySubscriptionInvoice(invoice)) continue;
                    subscriptionRevenue += (invoice.amount_paid || 0) / 100;
                }
                hasMore = more.has_more;
                lastId = more.data[more.data.length - 1]?.id;
            }
        }

        // Allow manual override for testing
        if (body.subscriptionRevenue !== undefined) {
            subscriptionRevenue = body.subscriptionRevenue;
        }

        const revenueSharePercent = body.revenueSharePercent || 20.0;

        // Run the calculation in the database
        const supabase = createSupabaseAdmin();
        const { data: guideCount, error } = await supabase.rpc("calculate_monthly_earnings", {
            p_month: monthStr,
            p_subscription_revenue: subscriptionRevenue,
            p_revenue_share_percent: revenueSharePercent,
        });

        if (error) {
            console.error("Payout calculation error:", error);
            return NextResponse.json({ error: "Calculation failed", details: error.message }, { status: 500 });
        }

        // Get the calculated earnings
        const { data: earnings } = await supabase
            .from("guide_earnings")
            .select("*")
            .eq("earning_month", monthStr)
            .order("gross_amount", { ascending: false });

        return NextResponse.json({
            month: monthStr,
            subscriptionRevenue,
            revenueSharePercent,
            revenuePool: subscriptionRevenue * (revenueSharePercent / 100),
            guidesWithEarnings: guideCount,
            earnings: earnings || [],
        });
    } catch (error) {
        console.error("Payout calculation error:", error);
        return NextResponse.json({ error: "Failed to calculate payouts" }, { status: 500 });
    }
}
