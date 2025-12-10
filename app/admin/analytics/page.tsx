"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import {
    HorizontalBarChart,
    SimpleLineChart,
    DonutChart,
    MetricCard,
} from "@/components/admin/analytics-charts";
import {
    DollarSign,
    Users,
    MousePointer,
    TrendingUp,
    Sparkles,
    Map,
    MessageSquare,
    Image as ImageIcon,
    RefreshCw,
    Calendar,
    ExternalLink,
    Crown,
    Star,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AnalyticsData {
    overview: {
        totalUsers: number;
        tierDistribution: { free: number; pro: number; premium: number };
        estimatedMRR: string;
        totalAffiliateClicks: number;
        totalConversions: number;
        totalAffiliateEarnings: string;
        conversionRate: string;
    };
    affiliates: {
        byPartner: Record<string, { clicks: number; views: number; conversions: number }>;
        byDay: Array<{ date: string; clicks: number; conversions: number }>;
        earnings: Array<{
            partner: string;
            period_date: string;
            clicks: number;
            conversions: number;
            commission_earned: string;
        }>;
    };
    usage: {
        totals: Record<string, number>;
    };
    subscriptions: {
        recent: Array<{
            tier: string;
            status: string;
            created_at: string;
            updated_at: string;
        }>;
        signupsByDay: Array<{ date: string; free: number; pro: number; premium: number }>;
    };
    period: {
        days: number;
        startDate: string;
        endDate: string;
    };
}

const PARTNER_COLORS: Record<string, string> = {
    viator: "#00AA6C",
    booking: "#003580",
    getyourguide: "#FF5533",
    klook: "#FF5722",
};

const TIER_COLORS = {
    free: "#64748b",
    pro: "#3b82f6",
    premium: "#8b5cf6",
};

export default function AdminAnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState(30);

    const fetchAnalytics = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/admin/analytics?days=${selectedPeriod}`);
            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error("You don't have permission to view analytics");
                }
                throw new Error("Failed to fetch analytics");
            }
            const result = await response.json();
            setData(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, [selectedPeriod]);

    if (error) {
        return (
            <div className="min-h-screen p-6 flex items-center justify-center">
                <GlassCard variant="subtle" className="p-8 text-center max-w-md">
                    <div className="text-destructive mb-4">
                        <ExternalLink className="h-12 w-12 mx-auto opacity-50" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
                    <p className="text-muted-foreground mb-4">{error}</p>
                    <Button onClick={fetchAnalytics}>Try Again</Button>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
                    <p className="text-muted-foreground">
                        Monitor your platform&apos;s performance and revenue
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Period selector */}
                    <div className="flex rounded-lg border bg-muted/30 p-1">
                        {[7, 30, 90].map((days) => (
                            <button
                                key={days}
                                onClick={() => setSelectedPeriod(days)}
                                className={cn(
                                    "px-3 py-1.5 text-sm rounded-md transition-colors",
                                    selectedPeriod === days
                                        ? "bg-background shadow-sm"
                                        : "hover:bg-background/50"
                                )}
                            >
                                {days}d
                            </button>
                        ))}
                    </div>

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={fetchAnalytics}
                        disabled={loading}
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {loading && !data ? (
                <LoadingSkeleton />
            ) : data ? (
                <>
                    {/* Overview Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard
                            title="Total Users"
                            value={data.overview.totalUsers.toLocaleString()}
                            icon={<Users className="h-5 w-5" />}
                        />
                        <MetricCard
                            title="Estimated MRR"
                            value={`$${data.overview.estimatedMRR}`}
                            icon={<DollarSign className="h-5 w-5" />}
                        />
                        <MetricCard
                            title="Affiliate Clicks"
                            value={data.overview.totalAffiliateClicks.toLocaleString()}
                            icon={<MousePointer className="h-5 w-5" />}
                        />
                        <MetricCard
                            title="Conversion Rate"
                            value={`${data.overview.conversionRate}%`}
                            icon={<TrendingUp className="h-5 w-5" />}
                        />
                    </div>

                    {/* Main Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Subscription Distribution */}
                        <GlassCard className="p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Crown className="h-5 w-5 text-primary" />
                                Subscription Tiers
                            </h2>
                            <DonutChart
                                data={[
                                    { label: "Free", value: data.overview.tierDistribution.free, color: TIER_COLORS.free },
                                    { label: "Pro", value: data.overview.tierDistribution.pro, color: TIER_COLORS.pro },
                                    { label: "Premium", value: data.overview.tierDistribution.premium, color: TIER_COLORS.premium },
                                ]}
                                centerValue={data.overview.totalUsers}
                                centerLabel="Total Users"
                            />
                        </GlassCard>

                        {/* Affiliate Performance */}
                        <GlassCard className="p-6 lg:col-span-2">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <ExternalLink className="h-5 w-5 text-primary" />
                                Affiliate Clicks Over Time
                            </h2>
                            {data.affiliates.byDay.length > 0 ? (
                                <SimpleLineChart
                                    data={data.affiliates.byDay.map((d) => ({
                                        date: d.date,
                                        value: d.clicks,
                                        secondaryValue: d.conversions,
                                    }))}
                                    primaryLabel="Clicks"
                                    secondaryLabel="Conversions"
                                    primaryColor="hsl(var(--primary))"
                                    secondaryColor="#22c55e"
                                />
                            ) : (
                                <div className="h-40 flex items-center justify-center text-muted-foreground">
                                    No affiliate data for this period
                                </div>
                            )}
                        </GlassCard>
                    </div>

                    {/* Second Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Affiliate Partners */}
                        <GlassCard className="p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Star className="h-5 w-5 text-primary" />
                                Clicks by Partner
                            </h2>
                            <HorizontalBarChart
                                data={Object.entries(data.affiliates.byPartner).map(([partner, stats]) => ({
                                    label: partner.charAt(0).toUpperCase() + partner.slice(1),
                                    value: stats.clicks,
                                    color: PARTNER_COLORS[partner] || "hsl(var(--primary))",
                                }))}
                            />

                            <div className="mt-6 pt-4 border-t">
                                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                                    Partner Earnings
                                </h3>
                                <div className="space-y-2">
                                    {Object.entries(data.affiliates.byPartner).map(([partner, stats]) => (
                                        <div key={partner} className="flex justify-between items-center text-sm">
                                            <span className="capitalize">{partner}</span>
                                            <div className="flex gap-4">
                                                <span className="text-muted-foreground">
                                                    {stats.conversions} conversions
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </GlassCard>

                        {/* Usage Stats */}
                        <GlassCard className="p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                Platform Usage
                            </h2>
                            <div className="grid grid-cols-2 gap-4">
                                <UsageStatCard
                                    icon={<Map className="h-5 w-5" />}
                                    label="Itineraries Created"
                                    value={data.usage.totals.itineraries_created || 0}
                                />
                                <UsageStatCard
                                    icon={<MessageSquare className="h-5 w-5" />}
                                    label="Chat Messages"
                                    value={data.usage.totals.chat_messages || 0}
                                />
                                <UsageStatCard
                                    icon={<ImageIcon className="h-5 w-5" />}
                                    label="AI Images"
                                    value={data.usage.totals.ai_images_generated || 0}
                                />
                                <UsageStatCard
                                    icon={<Star className="h-5 w-5" />}
                                    label="Spots Saved"
                                    value={data.usage.totals.spots_saved || 0}
                                />
                            </div>
                        </GlassCard>
                    </div>

                    {/* Subscription Trend */}
                    <GlassCard className="p-6">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            Subscription Signups Over Time
                        </h2>
                        {data.subscriptions.signupsByDay.length > 0 ? (
                            <SimpleLineChart
                                data={data.subscriptions.signupsByDay.map((d) => ({
                                    date: d.date,
                                    value: d.pro + d.premium,
                                    secondaryValue: d.free,
                                }))}
                                primaryLabel="Paid (Pro + Premium)"
                                secondaryLabel="Free"
                                primaryColor="#8b5cf6"
                                secondaryColor="#64748b"
                            />
                        ) : (
                            <div className="h-40 flex items-center justify-center text-muted-foreground">
                                No signup data for this period
                            </div>
                        )}
                    </GlassCard>

                    {/* Recent Activity */}
                    <GlassCard className="p-6">
                        <h2 className="text-lg font-semibold mb-4">Recent Subscription Changes</h2>
                        <div className="space-y-2">
                            {data.subscriptions.recent.length > 0 ? (
                                data.subscriptions.recent.map((sub, index) => (
                                    <div
                                        key={index}
                                        className="flex justify-between items-center p-3 rounded-lg bg-muted/30"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: TIER_COLORS[sub.tier as keyof typeof TIER_COLORS] }}
                                            />
                                            <span className="capitalize font-medium">{sub.tier}</span>
                                            <span
                                                className={cn(
                                                    "text-xs px-2 py-0.5 rounded-full",
                                                    sub.status === "active" && "bg-green-500/10 text-green-500",
                                                    sub.status === "canceled" && "bg-red-500/10 text-red-500",
                                                    sub.status === "trialing" && "bg-blue-500/10 text-blue-500",
                                                    sub.status === "past_due" && "bg-yellow-500/10 text-yellow-500"
                                                )}
                                            >
                                                {sub.status}
                                            </span>
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {new Date(sub.updated_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center text-muted-foreground py-8">
                                    No recent subscription changes
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </>
            ) : null}
        </div>
    );
}

function UsageStatCard({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
}) {
    return (
        <div className="p-4 rounded-lg bg-muted/30 border">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                {icon}
                <span className="text-sm">{label}</span>
            </div>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Skeleton className="h-64 rounded-xl" />
                <Skeleton className="h-64 rounded-xl lg:col-span-2" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-80 rounded-xl" />
                <Skeleton className="h-80 rounded-xl" />
            </div>
        </>
    );
}
