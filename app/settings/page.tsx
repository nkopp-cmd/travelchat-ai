import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Crown, Rocket, Sparkles, Check, Calendar, MessageSquare, Image as ImageIcon, Bookmark, ArrowRight } from "lucide-react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";
import Link from "next/link";
import { BillingPortalButton } from "@/components/subscription/billing-portal-button";
import { EmailPreferencesSection } from "@/components/settings/email-preferences";
import { NotificationPreferencesSection } from "@/components/settings/notification-preferences";

const LIQUID_CARD = "rounded-2xl border-white/10 bg-white/[0.055] shadow-2xl shadow-violet-950/20 backdrop-blur-xl";
const LIQUID_CARD_SOFT = "rounded-2xl border-white/10 bg-white/[0.04] shadow-xl shadow-violet-950/10 backdrop-blur-xl";
const LIQUID_ROW = "flex flex-col items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 transition-colors hover:bg-white/[0.07] sm:flex-row sm:items-center sm:justify-between";
const LIQUID_INPUT = "border-white/10 bg-white/[0.05] backdrop-blur-xl";

function usagePercent(used: number, limit: number) {
    if (!limit || limit === 999) return used > 0 ? 10 : 0;
    return Math.min((used / limit) * 100, 100);
}

async function getSubscriptionData() {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const supabase = createSupabaseAdmin();

    // Get subscription
    const { data: subscription } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("clerk_user_id", userId)
        .single();

    // Get usage data
    const today = new Date().toISOString().split("T")[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split("T")[0];

    const [
        { data: monthlyUsage },
        { data: dailyUsage },
        { count: savedSpotsCount },
    ] = await Promise.all([
        supabase
            .from("usage_tracking")
            .select("usage_type, count")
            .eq("clerk_user_id", userId)
            .eq("period_type", "monthly")
            .eq("period_start", monthStart),
        supabase
            .from("usage_tracking")
            .select("usage_type, count")
            .eq("clerk_user_id", userId)
            .eq("period_type", "daily")
            .eq("period_start", today),
        supabase
            .from("saved_spots")
            .select("*", { count: "exact", head: true })
            .eq("clerk_user_id", userId),
    ]);

    const getUsage = (data: { usage_type: string; count: number }[] | null, type: string): number => {
        if (!data) return 0;
        const record = data.find((r) => r.usage_type === type);
        return record?.count || 0;
    };

    return {
        subscription: subscription ? {
            tier: (subscription.tier || "free") as SubscriptionTier,
            status: subscription.status || "none",
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            stripeCustomerId: subscription.stripe_customer_id,
            billingCycle: subscription.billing_cycle || "monthly",
        } : {
            tier: "free" as SubscriptionTier,
            status: "none",
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            stripeCustomerId: null,
            billingCycle: "monthly",
        },
        usage: {
            itinerariesThisMonth: getUsage(monthlyUsage, "itineraries_created"),
            chatMessagesToday: getUsage(dailyUsage, "chat_messages"),
            aiImagesThisMonth: getUsage(monthlyUsage, "ai_images_generated"),
            savedSpots: savedSpotsCount || 0,
        },
    };
}

export default async function SettingsPage() {
    const user = await currentUser();

    if (!user) {
        redirect("/sign-in");
    }

    const { subscription, usage } = await getSubscriptionData();
    const tierConfig = TIER_CONFIGS[subscription.tier];
    const isActiveSub = ["active", "trialing"].includes(subscription.status);
    const planLabel = subscription.tier === "free" ? "Choose a paid plan" : `${tierConfig.name} Plan`;

    const TierIcon = subscription.tier === "premium" ? Crown : subscription.tier === "pro" ? Rocket : Sparkles;

    return (
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-28 pt-5 sm:space-y-6 sm:px-6 sm:pb-10 sm:pt-8">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-violet-950/20 backdrop-blur-xl sm:p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.28),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(79,70,229,0.18),transparent_30%)]" />
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2">
                        <Badge className="w-fit border-white/10 bg-white/10 text-white shadow-none hover:bg-white/10">
                            Account cockpit
                        </Badge>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
                            <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
                                Manage billing, preferences, and privacy without leaving your trip planning flow.
                            </p>
                        </div>
                    </div>
                    <Link href="/pricing" className="sm:self-center">
                        <Button variant="outline" className="w-full gap-2 border-white/15 bg-white/10 backdrop-blur-xl hover:bg-white/15 sm:w-auto">
                            Compare plans
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Subscription Management */}
            <Card className={`relative overflow-hidden ${LIQUID_CARD} ${
                subscription.tier === "premium"
                    ? "border-amber-300/30"
                    : subscription.tier === "pro"
                    ? "border-violet-300/30"
                    : ""
            }`}>
                {/* Premium glow effect */}
                {subscription.tier !== "free" && (
                    <div className={`absolute inset-0 pointer-events-none ${
                        subscription.tier === "premium"
                            ? "bg-gradient-to-br from-amber-400/5 via-transparent to-yellow-400/5"
                            : "bg-gradient-to-br from-violet-400/5 via-transparent to-indigo-400/5"
                    }`} />
                )}
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-full ${
                                subscription.tier === "premium"
                                    ? "bg-amber-400/15"
                                    : subscription.tier === "pro"
                                    ? "bg-violet-500/15"
                                    : "bg-white/10"
                            }`}>
                                <TierIcon className={`h-6 w-6 ${
                                    subscription.tier === "premium"
                                        ? "text-amber-600"
                                        : subscription.tier === "pro"
                                        ? "text-violet-600"
                                        : "text-muted-foreground"
                                }`} />
                            </div>
                            <div>
                                <CardTitle>Subscription</CardTitle>
                                <CardDescription>{planLabel}</CardDescription>
                            </div>
                        </div>
                        {isActiveSub && (
                            <Badge variant="secondary" className="w-fit border-emerald-400/20 bg-emerald-400/15 text-emerald-300">
                                Active
                            </Badge>
                        )}
                        {subscription.tier === "free" && (
                            <Badge variant="secondary" className="w-fit bg-violet-400/15 text-violet-200">
                                Plan required
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Current Plan Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-muted-foreground">Current Plan</Label>
                            <p className="font-semibold">{planLabel}</p>
                        </div>
                        {subscription.tier !== "free" && (
                            <>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Billing Cycle</Label>
                                    <p className="font-semibold capitalize">{subscription.billingCycle}</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">
                                        {subscription.cancelAtPeriodEnd ? "Subscription Ends" : "Next Billing Date"}
                                    </Label>
                                    <p className="font-semibold">
                                        {subscription.currentPeriodEnd
                                            ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", {
                                                month: "long",
                                                day: "numeric",
                                                year: "numeric",
                                            })
                                            : "N/A"}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-muted-foreground">Price</Label>
                                    <p className="font-semibold">
                                        ${tierConfig.price}/{subscription.billingCycle === "yearly" ? "year" : "month"}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {subscription.cancelAtPeriodEnd && (
                        <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-3">
                            <p className="text-sm text-amber-100">
                                Your subscription will be cancelled at the end of the current billing period. You will retain access until then.
                            </p>
                        </div>
                    )}

                    <Separator />

                    {/* Plan Features */}
                    <div>
                        <Label className="text-muted-foreground mb-3 block">
                            {subscription.tier === "free" ? "Pick a plan to activate" : "Your Plan Includes"}
                        </Label>
                        {subscription.tier === "free" ? (
                            <div className="rounded-xl border border-violet-300/20 bg-violet-400/10 p-4 text-sm leading-6 text-violet-50/80">
                                Localley is paid-only. Choose Pro for fast AI planning and exact addresses, or Premium for richer media, exports, and collaboration.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-emerald-400" />
                                    <span>{tierConfig.limits.itinerariesPerMonth === 999 ? "Unlimited" : tierConfig.limits.itinerariesPerMonth} itineraries/month</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-emerald-400" />
                                    <span>{tierConfig.limits.chatMessagesPerDay === 999 ? "Unlimited" : tierConfig.limits.chatMessagesPerDay} messages/day</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-emerald-400" />
                                    <span>{tierConfig.limits.aiImagesPerMonth} AI images/month</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-emerald-400" />
                                    <span>{tierConfig.limits.savedSpotsLimit === 999 ? "Unlimited" : tierConfig.limits.savedSpotsLimit} saved spots</span>
                                </div>
                                {tierConfig.features.activityImages !== "placeholder" && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Check className="h-4 w-4 text-emerald-400" />
                                        <span>AI-generated activity images</span>
                                    </div>
                                )}
                                {tierConfig.features.addressDisplay !== "area-only" && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Check className="h-4 w-4 text-emerald-400" />
                                        <span>Full addresses revealed</span>
                                    </div>
                                )}
                                {tierConfig.features.bookingDeals && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Check className="h-4 w-4 text-emerald-400" />
                                        <span>Exclusive booking deals</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* Actions */}
                    <div className="grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
                        {subscription.tier === "free" ? (
                            <Link href="/pricing" className="w-full sm:w-auto">
                                <Button className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 sm:w-auto">
                                    <Rocket className="h-4 w-4 mr-2" />
                                    Choose Pro
                                </Button>
                            </Link>
                        ) : (
                            <>
                                {subscription.stripeCustomerId && (
                                    <BillingPortalButton />
                                )}
                                {subscription.tier === "pro" && (
                                    <Link href="/pricing" className="w-full sm:w-auto">
                                        <Button variant="outline" className="w-full gap-2 border-white/15 bg-white/10 backdrop-blur-xl hover:bg-white/15 sm:w-auto">
                                            <Crown className="h-4 w-4 text-amber-500" />
                                            Choose Premium
                                        </Button>
                                    </Link>
                                )}
                            </>
                        )}
                        <Link href="/pricing" className="w-full sm:w-auto">
                            <Button variant="ghost" className="w-full gap-2 hover:bg-white/10 sm:w-auto">
                                Compare Plans
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Usage Overview */}
            <Card className={LIQUID_CARD_SOFT}>
                <CardHeader>
                    <CardTitle>Usage Overview</CardTitle>
                    <CardDescription>
                        {subscription.tier === "free"
                            ? "Usage tracking starts after plan activation"
                            : "Your current usage this billing period"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {subscription.tier === "free" ? (
                        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-muted-foreground">
                            Choose Pro or Premium to start planning with Localley. Your billing-period usage will appear here after activation.
                        </div>
                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Itineraries */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-violet-500" />
                                    <span className="font-medium">Itineraries Created</span>
                                </div>
                                <span className="text-muted-foreground">
                                    {usage.itinerariesThisMonth} / {tierConfig.limits.itinerariesPerMonth === 999 ? "∞" : tierConfig.limits.itinerariesPerMonth}
                                </span>
                            </div>
                            <Progress
                                value={usagePercent(usage.itinerariesThisMonth, tierConfig.limits.itinerariesPerMonth)}
                                className="h-2"
                            />
                        </div>

                        {/* Chat Messages */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-indigo-500" />
                                    <span className="font-medium">Chat Messages (Today)</span>
                                </div>
                                <span className="text-muted-foreground">
                                    {usage.chatMessagesToday} / {tierConfig.limits.chatMessagesPerDay === 999 ? "∞" : tierConfig.limits.chatMessagesPerDay}
                                </span>
                            </div>
                            <Progress
                                value={usagePercent(usage.chatMessagesToday, tierConfig.limits.chatMessagesPerDay)}
                                className="h-2"
                            />
                        </div>

                        {/* AI Images */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4 text-emerald-500" />
                                    <span className="font-medium">AI Images Generated</span>
                                </div>
                                <span className="text-muted-foreground">
                                    {usage.aiImagesThisMonth} / {tierConfig.limits.aiImagesPerMonth}
                                </span>
                            </div>
                            <Progress
                                value={usagePercent(usage.aiImagesThisMonth, tierConfig.limits.aiImagesPerMonth)}
                                className="h-2"
                            />
                        </div>

                        {/* Saved Spots */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <Bookmark className="h-4 w-4 text-rose-500" />
                                    <span className="font-medium">Saved Spots</span>
                                </div>
                                <span className="text-muted-foreground">
                                    {usage.savedSpots} / {tierConfig.limits.savedSpotsLimit === 999 ? "∞" : tierConfig.limits.savedSpotsLimit}
                                </span>
                            </div>
                            <Progress
                                value={usagePercent(usage.savedSpots, tierConfig.limits.savedSpotsLimit)}
                                className="h-2"
                            />
                        </div>
                    </div>
                    )}

                    {subscription.tier !== "free" && (
                        <p className="text-xs text-muted-foreground">
                            Usage resets at the start of each billing period. Chat messages reset daily.
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Email Preferences */}
            <Card className={LIQUID_CARD_SOFT}>
                <CardHeader>
                    <CardTitle>Email Preferences</CardTitle>
                    <CardDescription>Manage what emails you receive from Localley</CardDescription>
                </CardHeader>
                <CardContent>
                    <EmailPreferencesSection />
                </CardContent>
            </Card>

            {/* Notification Preferences */}
            <Card className={LIQUID_CARD_SOFT}>
                <CardHeader>
                    <CardTitle>Notification Preferences</CardTitle>
                    <CardDescription>Control how and when you receive notifications</CardDescription>
                </CardHeader>
                <CardContent>
                    <NotificationPreferencesSection />
                </CardContent>
            </Card>

            {/* App Preferences */}
            <Card className={LIQUID_CARD_SOFT}>
                <CardHeader>
                    <CardTitle>App Preferences</CardTitle>
                    <CardDescription>Customize your Localley experience</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className={`${LIQUID_ROW} group`}>
                        <div className="space-y-0.5">
                            <Label htmlFor="location" className="cursor-pointer group-hover:text-foreground transition-colors">Auto-detect Location</Label>
                            <p className="text-sm text-muted-foreground">
                                Show spots near you automatically when browsing
                            </p>
                        </div>
                        <Switch id="location" defaultChecked className="self-end data-[state=checked]:bg-violet-600 sm:self-auto" />
                    </div>
                </CardContent>
            </Card>

            {/* Display */}
            <Card className={LIQUID_CARD_SOFT}>
                <CardHeader>
                    <CardTitle>Display</CardTitle>
                    <CardDescription>Adjust how content is displayed</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="language">Language</Label>
                        <Select defaultValue="en">
                            <SelectTrigger id="language" className={LIQUID_INPUT}>
                                <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="ja">日本語 (Japanese)</SelectItem>
                                <SelectItem value="ko">한국어 (Korean)</SelectItem>
                                <SelectItem value="zh">中文 (Chinese)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="theme">Theme</Label>
                        <Select defaultValue="system">
                            <SelectTrigger id="theme" className={LIQUID_INPUT}>
                                <SelectValue placeholder="Select theme" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="light">Light</SelectItem>
                                <SelectItem value="dark">Dark</SelectItem>
                                <SelectItem value="system">System</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Privacy */}
            <Card className={LIQUID_CARD_SOFT}>
                <CardHeader>
                    <CardTitle>Privacy & Data</CardTitle>
                    <CardDescription>Control your data and privacy settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className={`${LIQUID_ROW} group`}>
                        <div className="space-y-0.5">
                            <Label htmlFor="analytics" className="cursor-pointer group-hover:text-foreground transition-colors">Usage Analytics</Label>
                            <p className="text-sm text-muted-foreground">
                                Help us improve Localley with anonymous usage insights
                            </p>
                        </div>
                        <Switch id="analytics" defaultChecked className="self-end data-[state=checked]:bg-violet-600 sm:self-auto" />
                    </div>

                    <div className={`${LIQUID_ROW} group`}>
                        <div className="space-y-0.5">
                            <Label htmlFor="personalization" className="cursor-pointer group-hover:text-foreground transition-colors">Personalized Recommendations</Label>
                            <p className="text-sm text-muted-foreground">
                                Get smarter spot suggestions based on your travel style
                            </p>
                        </div>
                        <Switch id="personalization" defaultChecked className="self-end data-[state=checked]:bg-violet-600 sm:self-auto" />
                    </div>
                </CardContent>
            </Card>

            {/* Account */}
            <Card className={LIQUID_CARD_SOFT}>
                <CardHeader>
                    <CardTitle>Account</CardTitle>
                    <CardDescription>Manage your account settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                            id="email"
                            type="email"
                            value={user.emailAddresses[0]?.emailAddress || ""}
                            disabled
                            className={LIQUID_INPUT}
                        />
                        <p className="text-xs text-muted-foreground">
                            Managed by your authentication provider
                        </p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <Label>Danger Zone</Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                                Clear All Data
                            </Button>
                            <Button variant="destructive">
                                Delete Account
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="sticky bottom-20 z-10 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#0b0714]/88 p-3 shadow-2xl shadow-violet-950/30 backdrop-blur-xl md:bottom-4 md:flex md:justify-end">
                <Button variant="outline" className="border-white/15 bg-white/10 hover:bg-white/15">Cancel</Button>
                <Button className="bg-violet-600 hover:bg-violet-700">
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
