import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
    try {
        const { response, userId } = await requireAdmin("/api/admin/analytics", "GET");
        if (response) return response;

        const supabase = createSupabaseAdmin();
        const { searchParams } = new URL(req.url);
        const days = parseInt(searchParams.get("days") || "30");

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split("T")[0];

        // Fetch all analytics data in parallel
        const [
            subscriptionStats,
            affiliateClicks,
            affiliateEarnings,
            usageStats,
            recentSubscriptions,
            dailySignups,
        ] = await Promise.all([
            // Subscription tier distribution
            supabase
                .from("subscriptions")
                .select("tier, status")
                .in("status", ["active", "trialing"]),

            // Affiliate clicks by partner (last N days)
            supabase
                .from("affiliate_clicks")
                .select("partner, event_type, created_at")
                .gte("created_at", startDateStr),

            // Affiliate earnings summary
            supabase
                .from("affiliate_earnings")
                .select("*")
                .gte("period_date", startDateStr)
                .order("period_date", { ascending: false }),

            // Usage statistics
            supabase
                .from("usage_tracking")
                .select("usage_type, count, period_start, period_type")
                .eq("period_type", "monthly")
                .gte("period_start", startDateStr),

            // Recent subscription changes
            supabase
                .from("subscriptions")
                .select("tier, status, created_at, updated_at")
                .order("updated_at", { ascending: false })
                .limit(10),

            // Daily signup trend (from subscriptions created)
            supabase
                .from("subscriptions")
                .select("created_at, tier")
                .gte("created_at", startDateStr),
        ]);

        // Process subscription stats
        const tierCounts = { free: 0, pro: 0, premium: 0 };
        (subscriptionStats.data || []).forEach((sub) => {
            if (sub.tier in tierCounts) {
                tierCounts[sub.tier as keyof typeof tierCounts]++;
            }
        });

        // Process affiliate clicks by partner and event type
        const clicksByPartner: Record<string, { clicks: number; views: number; conversions: number }> = {};
        const clicksByDay: Record<string, Record<string, number>> = {};

        (affiliateClicks.data || []).forEach((click) => {
            // By partner
            if (!clicksByPartner[click.partner]) {
                clicksByPartner[click.partner] = { clicks: 0, views: 0, conversions: 0 };
            }
            if (click.event_type === "click") clicksByPartner[click.partner].clicks++;
            else if (click.event_type === "view") clicksByPartner[click.partner].views++;
            else if (click.event_type === "conversion") clicksByPartner[click.partner].conversions++;

            // By day
            const day = click.created_at.split("T")[0];
            if (!clicksByDay[day]) {
                clicksByDay[day] = { clicks: 0, conversions: 0 };
            }
            if (click.event_type === "click") clicksByDay[day].clicks++;
            if (click.event_type === "conversion") clicksByDay[day].conversions++;
        });

        // Process usage stats
        const usageTotals: Record<string, number> = {};
        (usageStats.data || []).forEach((usage) => {
            usageTotals[usage.usage_type] = (usageTotals[usage.usage_type] || 0) + usage.count;
        });

        // Process daily signups
        const signupsByDay: Record<string, { free: number; pro: number; premium: number }> = {};
        (dailySignups.data || []).forEach((sub) => {
            const day = sub.created_at.split("T")[0];
            if (!signupsByDay[day]) {
                signupsByDay[day] = { free: 0, pro: 0, premium: 0 };
            }
            signupsByDay[day][sub.tier as keyof typeof signupsByDay[string]]++;
        });

        // Calculate totals
        const totalAffiliateClicks = Object.values(clicksByPartner).reduce((sum, p) => sum + p.clicks, 0);
        const totalConversions = Object.values(clicksByPartner).reduce((sum, p) => sum + p.conversions, 0);
        const totalEarnings = (affiliateEarnings.data || []).reduce((sum, e) => sum + (parseFloat(e.commission_earned) || 0), 0);

        // Calculate MRR estimate
        const proPriceMonthly = 9.99;
        const premiumPriceMonthly = 19.99;
        const estimatedMRR = (tierCounts.pro * proPriceMonthly) + (tierCounts.premium * premiumPriceMonthly);

        return NextResponse.json({
            overview: {
                totalUsers: Object.values(tierCounts).reduce((a, b) => a + b, 0),
                tierDistribution: tierCounts,
                estimatedMRR: estimatedMRR.toFixed(2),
                totalAffiliateClicks,
                totalConversions,
                totalAffiliateEarnings: totalEarnings.toFixed(2),
                conversionRate: totalAffiliateClicks > 0
                    ? ((totalConversions / totalAffiliateClicks) * 100).toFixed(2)
                    : "0.00",
            },
            affiliates: {
                byPartner: clicksByPartner,
                byDay: Object.entries(clicksByDay)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, data]) => ({ date, ...data })),
                earnings: affiliateEarnings.data || [],
            },
            usage: {
                totals: usageTotals,
            },
            subscriptions: {
                recent: recentSubscriptions.data || [],
                signupsByDay: Object.entries(signupsByDay)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([date, tiers]) => ({ date, ...tiers })),
            },
            period: {
                days,
                startDate: startDateStr,
                endDate: new Date().toISOString().split("T")[0],
            },
        });
    } catch (error) {
        console.error("Analytics API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch analytics" },
            { status: 500 }
        );
    }
}
