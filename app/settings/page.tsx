import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Crown, Rocket, Sparkles, CreditCard, ExternalLink, Check, Calendar, MessageSquare, Image as ImageIcon, Bookmark, ArrowRight } from "lucide-react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";
import Link from "next/link";
import { BillingPortalButton } from "@/components/subscription/billing-portal-button";
import { EmailPreferencesSection } from "@/components/settings/email-preferences";

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

    const TierIcon = subscription.tier === "premium" ? Crown : subscription.tier === "pro" ? Rocket : Sparkles;

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6 sm:space-y-8">
            <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                    Manage your account preferences and app settings
                </p>
            </div>

            {/* Subscription Management */}
            <Card className={`overflow-hidden ${
                subscription.tier === "premium"
                    ? "border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20"
                    : subscription.tier === "pro"
                    ? "border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20"
                    : ""
            }`}>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-full ${
                                subscription.tier === "premium"
                                    ? "bg-amber-100 dark:bg-amber-900/30"
                                    : subscription.tier === "pro"
                                    ? "bg-violet-100 dark:bg-violet-900/30"
                                    : "bg-muted"
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
                                <CardDescription className="capitalize">{subscription.tier} Plan</CardDescription>
                            </div>
                        </div>
                        {isActiveSub && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Active
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Current Plan Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label className="text-muted-foreground">Current Plan</Label>
                            <p className="font-semibold capitalize">{subscription.tier}</p>
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
                        <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                                Your subscription will be cancelled at the end of the current billing period. You will retain access until then.
                            </p>
                        </div>
                    )}

                    <Separator />

                    {/* Plan Features */}
                    <div>
                        <Label className="text-muted-foreground mb-3 block">Your Plan Includes</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="flex items-center gap-2 text-sm">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>{tierConfig.limits.itinerariesPerMonth === 999 ? "Unlimited" : tierConfig.limits.itinerariesPerMonth} itineraries/month</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>{tierConfig.limits.chatMessagesPerDay === 999 ? "Unlimited" : tierConfig.limits.chatMessagesPerDay} messages/day</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>{tierConfig.limits.aiImagesPerMonth} AI images/month</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <Check className="h-4 w-4 text-green-500" />
                                <span>{tierConfig.limits.savedSpotsLimit === 999 ? "Unlimited" : tierConfig.limits.savedSpotsLimit} saved spots</span>
                            </div>
                            {tierConfig.features.activityImages !== "placeholder" && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-green-500" />
                                    <span>AI-generated activity images</span>
                                </div>
                            )}
                            {tierConfig.features.addressDisplay !== "area-only" && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-green-500" />
                                    <span>Full addresses revealed</span>
                                </div>
                            )}
                            {tierConfig.features.bookingDeals && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-green-500" />
                                    <span>Exclusive booking deals</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <Separator />

                    {/* Actions */}
                    <div className="flex flex-wrap gap-3">
                        {subscription.tier === "free" ? (
                            <Link href="/pricing">
                                <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                                    <Rocket className="h-4 w-4 mr-2" />
                                    Upgrade Plan
                                </Button>
                            </Link>
                        ) : (
                            <>
                                {subscription.stripeCustomerId && (
                                    <BillingPortalButton />
                                )}
                                {subscription.tier === "pro" && (
                                    <Link href="/pricing">
                                        <Button variant="outline" className="gap-2">
                                            <Crown className="h-4 w-4 text-amber-500" />
                                            Upgrade to Premium
                                        </Button>
                                    </Link>
                                )}
                            </>
                        )}
                        <Link href="/pricing">
                            <Button variant="ghost" className="gap-2">
                                Compare Plans
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Usage Overview */}
            <Card>
                <CardHeader>
                    <CardTitle>Usage Overview</CardTitle>
                    <CardDescription>Your current usage this billing period</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                                value={tierConfig.limits.itinerariesPerMonth === 999 ? 10 : Math.min((usage.itinerariesThisMonth / tierConfig.limits.itinerariesPerMonth) * 100, 100)}
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
                                value={tierConfig.limits.chatMessagesPerDay === 999 ? 10 : Math.min((usage.chatMessagesToday / tierConfig.limits.chatMessagesPerDay) * 100, 100)}
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
                                value={Math.min((usage.aiImagesThisMonth / tierConfig.limits.aiImagesPerMonth) * 100, 100)}
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
                                value={tierConfig.limits.savedSpotsLimit === 999 ? 10 : Math.min((usage.savedSpots / tierConfig.limits.savedSpotsLimit) * 100, 100)}
                                className="h-2"
                            />
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Usage resets at the start of each billing period. Chat messages reset daily.
                    </p>
                </CardContent>
            </Card>

            {/* Email Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle>Email Preferences</CardTitle>
                    <CardDescription>Manage what emails you receive from Localley</CardDescription>
                </CardHeader>
                <CardContent>
                    <EmailPreferencesSection />
                </CardContent>
            </Card>

            {/* Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle>App Preferences</CardTitle>
                    <CardDescription>Customize your Localley experience</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="notifications">Push Notifications</Label>
                            <p className="text-sm text-muted-foreground">
                                Receive updates about new spots and itineraries
                            </p>
                        </div>
                        <Switch id="notifications" />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="location">Auto-detect Location</Label>
                            <p className="text-sm text-muted-foreground">
                                Automatically show spots near you
                            </p>
                        </div>
                        <Switch id="location" defaultChecked />
                    </div>
                </CardContent>
            </Card>

            {/* Display */}
            <Card>
                <CardHeader>
                    <CardTitle>Display</CardTitle>
                    <CardDescription>Adjust how content is displayed</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="language">Language</Label>
                        <Select defaultValue="en">
                            <SelectTrigger id="language">
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
                            <SelectTrigger id="theme">
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
            <Card>
                <CardHeader>
                    <CardTitle>Privacy & Data</CardTitle>
                    <CardDescription>Control your data and privacy settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="analytics">Usage Analytics</Label>
                            <p className="text-sm text-muted-foreground">
                                Help us improve by sharing anonymous usage data
                            </p>
                        </div>
                        <Switch id="analytics" defaultChecked />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="personalization">Personalized Recommendations</Label>
                            <p className="text-sm text-muted-foreground">
                                Get spot suggestions based on your preferences
                            </p>
                        </div>
                        <Switch id="personalization" defaultChecked />
                    </div>
                </CardContent>
            </Card>

            {/* Account */}
            <Card>
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
                        />
                        <p className="text-xs text-muted-foreground">
                            Managed by your authentication provider
                        </p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <Label>Danger Zone</Label>
                        <div className="flex gap-2">
                            <Button variant="outline" className="text-destructive hover:bg-destructive/10">
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
            <div className="flex justify-end gap-2">
                <Button variant="outline">Cancel</Button>
                <Button className="bg-violet-600 hover:bg-violet-700">
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
