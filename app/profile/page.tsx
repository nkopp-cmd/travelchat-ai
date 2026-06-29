import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Star, MapPin, Flame, Share2, Heart, Crown, Rocket, Sparkles, Calendar, MessageSquare, Image as ImageIcon, Bookmark, CreditCard } from "lucide-react";
import { getLevel, getNextLevelXp, getLevelProgress, getRankTitle } from "@/lib/gamification";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import { AppBackground } from "@/components/layout/app-background";
import { CityImageAvatar } from "@/components/ui/city-image";

const LIQUID_CARD = "rounded-2xl border-white/10 bg-white/[0.055] shadow-2xl shadow-violet-950/20 backdrop-blur-xl";
const LIQUID_CARD_SOFT = "rounded-2xl border-white/10 bg-white/[0.04] shadow-xl shadow-violet-950/10 backdrop-blur-xl";
const STAT_TILE = "rounded-xl border border-white/10 bg-white/[0.055] p-3 backdrop-blur-xl";

async function getUserProgress() {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const supabase = createSupabaseAdmin();

    // Get user's internal ID and XP from users table
    const { data: userData } = await supabase
        .from("users")
        .select("id, xp, level")
        .eq("clerk_id", userId)
        .single();

    // Get user progress from user_progress table (uses internal user_id)
    let progress = null;
    if (userData?.id) {
        const { data: progressData } = await supabase
            .from("user_progress")
            .select("*")
            .eq("user_id", userData.id)
            .single();
        progress = progressData;
    }

    // Merge XP from users table with progress data
    const mergedProgress = {
        xp: userData?.xp || progress?.xp || 0,
        level: userData?.level || 1,
        streak: progress?.current_streak || 0,
        discoveries: progress?.discoveries || 0,
        spots_visited: progress?.spots_visited || 0,
    };

    // Get user's completed challenges (uses internal user_id)
    let completedChallenges: Array<{ id: string; challenges: { title: string; description: string; xp_reward: number } }> = [];
    if (userData?.id) {
        const { data: challengesData } = await supabase
            .from("user_challenges")
            .select("*, challenges(*)")
            .eq("user_id", userData.id)
            .eq("completed", true);
        completedChallenges = challengesData || [];
    }

    // Get user's saved itineraries with details (uses clerk_user_id)
    const { data: itineraries } = await supabase
        .from("itineraries")
        .select("id, title, city, days, created_at, metadata")
        .eq("clerk_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);

    // Get user's saved spots
    const { data: savedSpots } = await supabase
        .from("saved_spots")
        .select(`
            id,
            spot_id,
            created_at,
            spots (
                id,
                name,
                description,
                category,
                localley_score,
                photos,
                address
            )
        `)
        .eq("clerk_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);

    // Get subscription data
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
    ]);

    const getUsage = (data: { usage_type: string; count: number }[] | null, type: string): number => {
        if (!data) return 0;
        const record = data.find((r) => r.usage_type === type);
        return record?.count || 0;
    };

    return {
        progress: mergedProgress,
        completedChallenges,
        itineraries: itineraries || [],
        itinerariesCount: itineraries?.length || 0,
        savedSpots: savedSpots || [],
        subscription: subscription ? {
            tier: (subscription.tier || "free") as SubscriptionTier,
            status: subscription.status || "none",
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        } : { tier: "free" as SubscriptionTier, status: "none", currentPeriodEnd: null, cancelAtPeriodEnd: false },
        usage: {
            itinerariesThisMonth: getUsage(monthlyUsage, "itineraries_created"),
            chatMessagesToday: getUsage(dailyUsage, "chat_messages"),
            aiImagesThisMonth: getUsage(monthlyUsage, "ai_images_generated"),
            savedSpots: savedSpots?.length || 0,
        },
    };
}

export default async function ProfilePage() {
    const user = await currentUser();

    if (!user) {
        redirect("/sign-in");
    }

    const { progress, completedChallenges, itineraries, savedSpots, subscription, usage } = await getUserProgress();

    const level = getLevel(progress.xp);
    const levelProgress = getLevelProgress(progress.xp);
    const rank = getRankTitle(level);
    const nextLevelXp = getNextLevelXp(level);

    const tierConfig = TIER_CONFIGS[subscription.tier];
    const isActiveSub = ["active", "trialing"].includes(subscription.status);
    const planLabel = subscription.tier === "free" ? "No paid plan" : `${tierConfig.name} Plan`;

    const TierIcon = subscription.tier === "premium" ? Crown : subscription.tier === "pro" ? Rocket : Sparkles;

    // Calculate user stats
    const joinedDate = new Date(user.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
    });

    // Get tier-specific ring color for avatar
    const tierRingColor = subscription.tier === "premium"
        ? "ring-amber-400"
        : subscription.tier === "pro"
        ? "ring-violet-400"
        : "ring-violet-200 dark:ring-violet-800";

    return (
        <AppBackground ambient className="min-h-screen">
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-28 pt-5 sm:space-y-6 sm:px-6 sm:pb-10 sm:pt-8 animate-in fade-in duration-500">
            {/* Profile Header */}
            <div className={`relative overflow-hidden ${LIQUID_CARD}`}>
                {/* Enhanced header with pattern overlay */}
                <div className="h-24 sm:h-32 bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-700 relative overflow-hidden">
                    {/* Decorative pattern overlay */}
                    <div className="absolute inset-0 opacity-10">
                        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                            <defs>
                                <pattern id="profile-pattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                                    <circle cx="2" cy="2" r="1" fill="currentColor" />
                                    <circle cx="12" cy="8" r="1.5" fill="currentColor" />
                                    <path d="M2 2 L12 8" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2" />
                                </pattern>
                            </defs>
                            <rect width="100" height="100" fill="url(#profile-pattern)" className="text-white" />
                        </svg>
                    </div>
                    {/* Gradient fade at bottom */}
                    <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/20 to-transparent" />
                </div>
                <div className="px-4 sm:px-8 pb-6 sm:pb-8">
                    <div className="relative flex flex-col md:flex-row justify-between items-start md:items-end -mt-10 sm:-mt-12 mb-4 sm:mb-6 gap-4">
                        <div className="flex items-end gap-4 sm:gap-6">
                            <Avatar className={`h-20 w-20 sm:h-24 sm:w-24 border-4 border-[#12091f] shadow-lg ring-2 ${tierRingColor} ring-offset-2 ring-offset-[#12091f]`}>
                                <AvatarImage src={user.imageUrl} />
                                <AvatarFallback className="text-xl sm:text-2xl bg-slate-200 dark:bg-slate-800">
                                    {user.firstName?.[0]}{user.lastName?.[0]}
                                </AvatarFallback>
                            </Avatar>
                            <div className="mb-1">
                                <h1 className="text-xl sm:text-2xl font-bold">
                                    {user.firstName} {user.lastName}
                                </h1>
                                <p className="text-sm sm:text-base text-muted-foreground">
                                    @{user.username || user.emailAddresses[0].emailAddress.split("@")[0]}
                                </p>
                                {typeof user.unsafeMetadata?.bio === "string" && user.unsafeMetadata.bio && (
                                    <p className="text-sm text-muted-foreground mt-1 max-w-md">
                                        {user.unsafeMetadata.bio}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex w-full gap-2 mb-1 sm:w-auto">
                            <EditProfileDialog
                                initialBio={(user.unsafeMetadata?.bio as string) || ""}
                            />
                            <Button size="sm" className="flex-1 bg-violet-600 hover:bg-violet-700 sm:flex-none">
                                <Share2 className="mr-2 h-4 w-4" />
                                <span className="hidden sm:inline">Share Profile</span>
                                <span className="sm:hidden">Share</span>
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Explorer Rank - warmer gamification language */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-medium">
                                <div className="flex items-center gap-2">
                                    <Star className="h-4 w-4 text-violet-500" />
                                    <span>{rank}</span>
                                </div>
                                <span className="text-muted-foreground">{nextLevelXp - progress.xp} XP to go</span>
                            </div>
                            <Progress value={levelProgress} className="h-3 bg-secondary" />
                            <p className="text-xs text-muted-foreground">
                                Keep exploring to reach the next rank!
                            </p>
                        </div>

                        {/* Stats with friendlier labels */}
                        <div className="flex justify-between items-center gap-4">
                            <div className={`${STAT_TILE} text-center flex-1`}>
                                <div className="flex justify-center mb-1">
                                    <MapPin className="h-5 w-5 text-violet-500" />
                                </div>
                                <div className="font-bold text-xl">{progress.discoveries || 0}</div>
                                <div className="text-xs text-muted-foreground">Places found</div>
                            </div>
                            <div className={`${STAT_TILE} text-center flex-1`}>
                                <div className="flex justify-center mb-1">
                                    <Flame className="h-5 w-5 text-orange-500" />
                                </div>
                                <div className="font-bold text-xl">{progress.streak || 0}</div>
                                <div className="text-xs text-muted-foreground">{progress.streak === 1 ? "Day" : "Days"} exploring</div>
                            </div>
                            <Link href="/leaderboard" className={`${STAT_TILE} text-center flex-1 transition-colors hover:bg-white/[0.08]`}>
                                <div className="flex justify-center mb-1">
                                    <Trophy className="h-5 w-5 text-yellow-500" />
                                </div>
                                <div className="font-bold text-xl">{completedChallenges.length}</div>
                                <div className="text-xs text-muted-foreground">{completedChallenges.length === 1 ? "Badge" : "Badges"} earned</div>
                            </Link>
                        </div>
                    </div>

                    {/* CTAs */}
                    <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
                        <Link href="/leaderboard" className="flex-1">
                            <Button variant="outline" className="w-full gap-2 border-white/15 bg-white/10 hover:bg-yellow-500/10 hover:border-yellow-500/50">
                                <Trophy className="h-4 w-4 text-yellow-500" />
                                Leaderboard
                            </Button>
                        </Link>
                        <Link href="/challenges" className="flex-1">
                            <Button variant="outline" className="w-full gap-2 border-white/15 bg-white/10 hover:bg-violet-500/10 hover:border-violet-500/50">
                                <Star className="h-4 w-4 text-violet-500" />
                                Challenges
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Subscription & Usage Card */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Subscription Status */}
                <Card className={`overflow-hidden ${LIQUID_CARD_SOFT} ${
                    subscription.tier === "premium"
                        ? "border-amber-300/25"
                        : subscription.tier === "pro"
                        ? "border-violet-300/25"
                        : ""
                }`}>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${
                                    subscription.tier === "premium"
                                        ? "bg-amber-400/15"
                                        : subscription.tier === "pro"
                                        ? "bg-violet-500/15"
                                        : "bg-white/10"
                                }`}>
                                    <TierIcon className={`h-5 w-5 ${
                                        subscription.tier === "premium"
                                            ? "text-amber-600"
                                            : subscription.tier === "pro"
                                            ? "text-violet-600"
                                            : "text-muted-foreground"
                                    }`} />
                                </div>
                                <div>
                                    <CardTitle className="text-lg">{planLabel}</CardTitle>
                                    <CardDescription>
                                        {subscription.tier === "free"
                                            ? "Choose a paid plan to start planning with Localley"
                                            : `$${tierConfig.price}/month`}
                                    </CardDescription>
                                </div>
                            </div>
                            {subscription.tier !== "free" && isActiveSub && (
                                <Badge variant="secondary" className="bg-emerald-400/15 text-emerald-300">
                                    Active
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {subscription.tier === "free" ? (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Pick Pro or Premium to unlock richer AI planning, full addresses, booking deals, and trip exports.
                                </p>
                                <div className="flex gap-2">
                                    <Link href="/pricing" className="flex-1">
                                        <Button className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                                            <Rocket className="h-4 w-4 mr-2" />
                                            Upgrade to Pro
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {subscription.currentPeriodEnd && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            {subscription.cancelAtPeriodEnd ? "Ends on" : "Renews on"}
                                        </span>
                                        <span className="font-medium">
                                            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                                        </span>
                                    </div>
                                )}
                                {subscription.cancelAtPeriodEnd && (
                                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                                        Cancels at period end
                                    </Badge>
                                )}
                                <Link href="/settings">
                                    <Button variant="outline" className="w-full gap-2">
                                        <CreditCard className="h-4 w-4" />
                                        Manage Subscription
                                    </Button>
                                </Link>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Usage Dashboard - Humanized */}
                <Card className={LIQUID_CARD_SOFT}>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Your Activity</CardTitle>
                        <CardDescription>Here&apos;s what you&apos;ve been up to</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Itineraries - contextual messaging */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-violet-500" />
                                    <span>
                                        {usage.itinerariesThisMonth === 0
                                            ? "No trips planned yet this month"
                                            : `${usage.itinerariesThisMonth} ${usage.itinerariesThisMonth === 1 ? "trip" : "trips"} planned this month`}
                                    </span>
                                </div>
                                {tierConfig.limits.itinerariesPerMonth !== 999 && (
                                    <span className="text-xs text-muted-foreground">
                                        {tierConfig.limits.itinerariesPerMonth - usage.itinerariesThisMonth} left
                                    </span>
                                )}
                            </div>
                            <Progress
                                value={tierConfig.limits.itinerariesPerMonth === 999 ? 10 : (usage.itinerariesThisMonth / tierConfig.limits.itinerariesPerMonth) * 100}
                                className="h-2"
                            />
                        </div>

                        {/* Chat Messages - conversational */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-indigo-500" />
                                    <span>
                                        {usage.chatMessagesToday === 0
                                            ? "Chat with Alley anytime"
                                            : `${usage.chatMessagesToday} ${usage.chatMessagesToday === 1 ? "chat" : "chats"} today`}
                                    </span>
                                </div>
                                {tierConfig.limits.chatMessagesPerDay !== 999 && (
                                    <span className="text-xs text-muted-foreground">
                                        {tierConfig.limits.chatMessagesPerDay - usage.chatMessagesToday} left today
                                    </span>
                                )}
                            </div>
                            <Progress
                                value={tierConfig.limits.chatMessagesPerDay === 999 ? 10 : (usage.chatMessagesToday / tierConfig.limits.chatMessagesPerDay) * 100}
                                className="h-2"
                            />
                        </div>

                        {/* AI Images - achievement framing */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4 text-emerald-500" />
                                    <span>
                                        {usage.aiImagesThisMonth === 0
                                            ? "Create AI images of your trips"
                                            : `${usage.aiImagesThisMonth} ${usage.aiImagesThisMonth === 1 ? "image" : "images"} created`}
                                    </span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {tierConfig.limits.aiImagesPerMonth - usage.aiImagesThisMonth} left
                                </span>
                            </div>
                            <Progress
                                value={(usage.aiImagesThisMonth / tierConfig.limits.aiImagesPerMonth) * 100}
                                className="h-2"
                            />
                        </div>

                        {/* Saved Spots - collection framing */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <Bookmark className="h-4 w-4 text-rose-500" />
                                    <span>
                                        {usage.savedSpots === 0
                                            ? "Save spots you want to visit"
                                            : `${usage.savedSpots} ${usage.savedSpots === 1 ? "spot" : "spots"} in your collection`}
                                    </span>
                                </div>
                                {tierConfig.limits.savedSpotsLimit !== 999 && (
                                    <span className="text-xs text-muted-foreground">
                                        {tierConfig.limits.savedSpotsLimit - usage.savedSpots} slots left
                                    </span>
                                )}
                            </div>
                            <Progress
                                value={tierConfig.limits.savedSpotsLimit === 999 ? 10 : (usage.savedSpots / tierConfig.limits.savedSpotsLimit) * 100}
                                className="h-2"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Content Tabs */}
            <Tabs defaultValue="achievements" className="w-full">
                <TabsList className="grid w-full grid-cols-3 border border-white/10 bg-white/[0.055] backdrop-blur-xl lg:w-[400px]">
                    <TabsTrigger value="achievements">Achievements</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="saved">Saved</TabsTrigger>
                </TabsList>

                <TabsContent value="achievements" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* First Steps Achievement */}
                        <Card className={`${LIQUID_CARD_SOFT} transition-all hover:bg-white/[0.07]`}>
                            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                                    <Trophy className="h-6 w-6 text-yellow-500" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">First Steps</CardTitle>
                                    <p className="text-xs text-muted-foreground">Joined Localley</p>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                                    Completed
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-2">Earned {joinedDate}</p>
                            </CardContent>
                        </Card>

                        {/* Display completed challenges */}
                        {completedChallenges.slice(0, 5).map((userChallenge) => (
                            <Card
                                key={userChallenge.id}
                                className={`${LIQUID_CARD_SOFT} transition-all hover:bg-white/[0.07]`}
                            >
                                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                    <div className="h-12 w-12 rounded-full bg-violet-500/10 flex items-center justify-center">
                                        <Star className="h-6 w-6 text-violet-500" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">{userChallenge.challenges.title}</CardTitle>
                                        <p className="text-xs text-muted-foreground">{userChallenge.challenges.description}</p>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                                        Completed
                                    </Badge>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        +{userChallenge.challenges.xp_reward} XP
                                    </p>
                                </CardContent>
                            </Card>
                        ))}

                        {/* Streak Achievement (In Progress) */}
                        {progress.streak < 7 && (
                            <Card className={`${LIQUID_CARD_SOFT} opacity-70 grayscale transition-all hover:opacity-100 hover:grayscale-0`}>
                                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                        <Flame className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">On Fire</CardTitle>
                                        <p className="text-xs text-muted-foreground">7 Day Streak</p>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Progress value={(progress.streak / 7) * 100} className="h-2 mb-2" />
                                    <p className="text-xs text-muted-foreground">{progress.streak} / 7 Days</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="history">
                    {itineraries.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {itineraries.map((itinerary) => {
                                const createdDate = new Date(itinerary.created_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                });
                                const metadata = itinerary.metadata as { pace?: string; focus?: string[] } | null;

                                return (
                                    <Link key={itinerary.id} href={`/itineraries/${itinerary.id}`} className="group block h-full">
                                        <Card className={`h-full overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-500/10 flex flex-col ${LIQUID_CARD_SOFT}`}>
                                            {/* Gradient Header */}
                                            <div className="relative h-24 overflow-hidden bg-gradient-to-r from-violet-500 to-indigo-500">
                                                <CityImageAvatar
                                                    city={itinerary.city}
                                                    className="absolute inset-0 h-full w-full rounded-none"
                                                    imageClassName="transition duration-500 group-hover:scale-105"
                                                    sizes="(max-width: 768px) 100vw, 33vw"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />
                                                <div className="absolute bottom-2 left-3 right-3 flex justify-between items-end">
                                                    <Badge className="bg-white/90 text-violet-700 hover:bg-white">
                                                        {itinerary.city}
                                                    </Badge>
                                                    <span className="text-white/90 text-xs">{itinerary.days} days</span>
                                                </div>
                                            </div>
                                            <CardContent className="p-3 flex-1 flex flex-col">
                                                <h3 className="font-semibold text-sm line-clamp-1">
                                                    {itinerary.title || `${itinerary.city} Adventure`}
                                                </h3>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                    <Calendar className="h-3 w-3" />
                                                    <span>{createdDate}</span>
                                                </div>
                                                {metadata?.pace && (
                                                    <Badge variant="secondary" className="text-xs mt-2 w-fit capitalize">
                                                        {metadata.pace}
                                                    </Badge>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <Card className={LIQUID_CARD_SOFT}>
                            <CardContent className="pt-6">
                                <div className="text-center py-8">
                                    <Calendar className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                                    <p className="text-muted-foreground mb-4">
                                        No itineraries yet
                                    </p>
                                    <Link href="/chat">
                                        <Button variant="outline" size="sm">
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            Plan Your First Trip
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="saved">
                    {savedSpots.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {savedSpots.map((saved) => {
                                const spot = saved.spots as unknown as {
                                    id: string;
                                    name: { en?: string } | string;
                                    description: { en?: string } | string;
                                    category: string;
                                    localley_score: number;
                                    photos: string[];
                                    address: { en?: string } | string;
                                } | null;
                                if (!spot) return null;

                                const spotName = typeof spot.name === 'object' ? spot.name.en : spot.name;
                                const spotDesc = typeof spot.description === 'object' ? spot.description.en : spot.description;

                                return (
                                    <Link key={saved.id} href={`/spots/${spot.id}`} className="group block h-full">
                                        <Card className={`h-full overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-500/10 flex flex-col ${LIQUID_CARD_SOFT}`}>
                                            <div className="relative aspect-video w-full overflow-hidden">
                                                <Image
                                                    src={spot.photos?.[0] || "/placeholder-spot.svg"}
                                                    alt={spotName || "Spot"}
                                                    fill
                                                    className="object-cover"
                                                />
                                                <div className="absolute top-2 right-2">
                                                    <div className="bg-red-500/90 backdrop-blur-sm rounded-full p-1.5">
                                                        <Heart className="h-3 w-3 text-white fill-white" />
                                                    </div>
                                                </div>
                                                <Badge className="absolute top-2 left-2 bg-violet-600/90 backdrop-blur-sm">
                                                    {spot.localley_score}/6
                                                </Badge>
                                            </div>
                                            <CardContent className="p-3 flex-1">
                                                <h3 className="font-semibold text-sm line-clamp-1">
                                                    {spotName}
                                                </h3>
                                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                                    {spotDesc}
                                                </p>
                                                <Badge variant="secondary" className="text-xs mt-2">
                                                    {spot.category}
                                                </Badge>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <Card className={LIQUID_CARD_SOFT}>
                            <CardContent className="pt-6">
                                <div className="text-center py-8">
                                    <Heart className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                                    <p className="text-muted-foreground mb-4">
                                        No saved spots yet
                                    </p>
                                    <Link href="/spots">
                                        <Button variant="outline" size="sm">
                                            <MapPin className="mr-2 h-4 w-4" />
                                            Explore Spots
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>
        </div>
        </AppBackground>
    );
}
