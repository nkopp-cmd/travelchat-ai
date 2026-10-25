import { headers } from "next/headers";
import { savedSpotsWithSpots } from "@/lib/app-data/saved-spots";
import { appDataDb, dataBackend } from "@/lib/app-data/backend";
import { completedChallengesWithDetails, profileProgressByOwner } from "@/lib/app-data/user-challenges";
import { previewProfile } from "@/lib/app-data/preview-profile";
import { PreviewProfile } from "@/components/profile/preview-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Star, MapPin, Flame, Share2, Heart, Crown, Rocket, Sparkles, Calendar, MessageSquare, Image as ImageIcon, Bookmark, CreditCard } from "@/components/ui/icons";
import { getLevel, getNextLevelXp, getLevelProgress, getRankTitle } from "@/lib/gamification";
import { auth, currentUser } from "@/lib/auth/server";
import { isActivePlanStatus, withLifetimePremium } from "@/lib/lifetime-premium";
import { createSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SubscriptionTier, TIER_CONFIGS } from "@/lib/subscription";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import { AppBackground } from "@/components/layout/app-background";
import { CityImageAvatar } from "@/components/ui/city-image";

const LIQUID_CARD = "rounded-2xl bg-raised backdrop-blur-xl";
const LIQUID_CARD_SOFT = "rounded-2xl bg-raised backdrop-blur-xl";
const STAT_TILE = "rounded-xl bg-raised p-3 backdrop-blur-xl";

function usagePercent(used: number, limit: number) {
    if (!limit || limit === 999) return used > 0 ? 10 : 0;
    return Math.min((used / limit) * 100, 100);
}

function remainingCount(used: number, limit: number) {
    return Math.max(limit - used, 0);
}

/**
 * Per-phase timing for perf-speed-of-light.md (/profile item): each read records when it finished, in ms after the page
 * started. Rendered only with ?timing=1 as a JSON block of numbers (no user data). Workers' clock advances on I/O.
 */
type Marks = Record<string, number>;
/** Not a render value: only timestamps for the diagnostic block. */
const clock = () => Date.now();
function timed<T>(marks: Marks, start: number, name: string, work: PromiseLike<T>): Promise<T> {
    return Promise.resolve(work).then((value) => { marks[name] = clock() - start; return value; });
}

async function getUserProgress(marks: Marks = {}, start = clock()) {
    const { userId } = await timed(marks, start, "auth", auth());

    if (!userId) {
        redirect("/sign-in");
    }

    const supabase = createSupabaseAdmin();
    const today = new Date().toISOString().split("T")[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split("T")[0];

    // Everything keyed by the signed-in user id starts at once. Progress and completed challenges need the internal
    // user id, so they chain on the users read instead of waiting for the whole first round (one fewer round trip).
    // public.challenges has `name` (no `title`); user_challenges is keyed by (user_id, challenge_id).
    const userRead = timed(marks, start, "users", supabase.from("users").select("id, xp, level").eq("clerk_id", userId).single());
    // D1: one batch keyed by the owner id, in the same round as the reads below (the chain on users cost a round trip).
    const progressReads = dataBackend() === "d1"
        ? timed(marks, start, "progress", profileProgressByOwner(appDataDb() as never, userId))
            .then(({ progress, challenges }) => [{ data: progress }, { data: challenges }] as const)
        : Promise.resolve(userRead).then(async ({ data }) => {
        if (!data?.id) return [{ data: null }, { data: null }] as const;
        return Promise.all([
            timed(marks, start, "progress", supabase.from("user_progress").select("*").eq("user_id", data.id).single()),
            timed(marks, start, "challenges", completedChallengesWithDetails(supabase, data.id)),
        ]);
    });
    const [
        { data: userData },
        { data: itineraries },
        { data: savedSpots },
        { data: subscription },
        { data: monthlyUsage },
        { data: dailyUsage },
        [{ data: progress }, { data: challengesData }],
    ] = await Promise.all([
        userRead,
        timed(marks, start, "itineraries", supabase
            .from("itineraries")
            .select("id, title, city, days, created_at")
            .eq("clerk_user_id", userId)
            .order("created_at", { ascending: false })
            .limit(12)),
        timed(marks, start, "savedSpots", savedSpotsWithSpots(supabase, userId,
            ["id", "name", "description", "category", "localley_score", "photos", "address"], 12)),
        timed(marks, start, "subscription", supabase.from("subscriptions").select("*").eq("clerk_user_id", userId).single()),
        timed(marks, start, "usageMonthly", supabase
            .from("usage_tracking")
            .select("usage_type, count")
            .eq("clerk_user_id", userId)
            .eq("period_type", "monthly")
            .eq("period_start", monthStart)),
        timed(marks, start, "usageDaily", supabase
            .from("usage_tracking")
            .select("usage_type, count")
            .eq("clerk_user_id", userId)
            .eq("period_type", "daily")
            .eq("period_start", today)),
        progressReads,
    ]);

    const completedChallenges: Array<{ challenge_id: string; challenges: { name: string; description: string; xp_reward: number } | null }> =
        challengesData || [];

    // Merge XP from users table with progress data
    const mergedProgress = {
        xp: userData?.xp || progress?.xp || 0,
        level: userData?.level || 1,
        streak: progress?.current_streak || 0,
        discoveries: progress?.discoveries || 0,
        spots_visited: progress?.spots_visited || 0,
    };

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

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ data_candidate?: string; timing?: string }> }) {
    const start = clock();
    const marks: Marks = {};
    const user = await timed(marks, start, "currentUser", currentUser());

    if (!user) {
        redirect("/sign-in");
    }

    const params = await searchParams;
    const host = (await headers()).get("host");
    // Explicit candidate intent must not fall back when isolation configuration is unavailable.
    if (host === "localley-next-preview.nkopp.workers.dev" && params.data_candidate === "d1") {
        let profile = null;
        if (process.env.AUTH_MAIL_MODE === "outbox" && process.env.SUPABASE_READ_ONLY === "true") {
            try { profile = await previewProfile(user.id); }
            catch { /* Keep private failures generic and never enter the source path. */ }
        }
        return <PreviewProfile profile={profile} />;
    }

    const progressData = await getUserProgress(marks, start);
    marks.data = clock() - start;
    const { progress, completedChallenges, itineraries, savedSpots, usage } = progressData;
    const subscription = withLifetimePremium(progressData.subscription, user.emailAddresses[0]?.emailAddress);

    const level = getLevel(progress.xp);
    const levelProgress = getLevelProgress(progress.xp);
    const rank = getRankTitle(level);
    const nextLevelXp = getNextLevelXp(level);

    const tierConfig = TIER_CONFIGS[subscription.tier];
    const isActiveSub = isActivePlanStatus(subscription.status);
    const planLabel = subscription.tier === "free" ? "Choose a paid plan" : `${tierConfig.name} Plan`;

    const TierIcon = subscription.tier === "premium" ? Crown : subscription.tier === "pro" ? Rocket : Sparkles;

    // Calculate user stats
    const joinedDate = new Date(user.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
    });

    // Get tier-specific ring color for avatar
    const tierRingColor = subscription.tier === "premium"
        ? ""
        : subscription.tier === "pro"
        ? ""
        : " ";

    return (
        <AppBackground ambient className="min-h-screen">
        {params.timing === "1" && <script type="application/json" id="profile-timing" dangerouslySetInnerHTML={{ __html: JSON.stringify(marks) }} />}
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-28 pt-5 sm:space-y-6 sm:px-6 sm:pb-10 sm:pt-8 animate-in fade-in duration-500">
            {/* Profile Header */}
            <div className={`relative overflow-hidden ${LIQUID_CARD}`}>
                {/* Enhanced header with pattern overlay */}
                <div className="h-24 sm:h-32 bg-raised relative overflow-hidden">
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
                            <rect width="100" height="100" fill="url(#profile-pattern)" className="text-primary" />
                        </svg>
                    </div>
                    {/* Gradient fade at bottom */}
                    <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/20 to-transparent" />
                </div>
                <div className="px-4 sm:px-8 pb-6 sm:pb-8">
                    <div className="relative flex flex-col md:flex-row justify-between items-start md:items-end -mt-10 sm:-mt-12 mb-4 sm:mb-6 gap-4">
                        <div className="flex items-end gap-4 sm:gap-6">
                            <Avatar className={`h-20 w-20 sm:h-24 sm:w-24 shadow-lg ${tierRingColor} ring-offset-2 ring-offset-background`}>
                                <AvatarImage src={user.imageUrl} />
                                <AvatarFallback className="text-xl sm:text-2xl bg-overlay">
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
                        <div className="mb-1 grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                            <EditProfileDialog
                                initialBio={(user.unsafeMetadata?.bio as string) || ""}
                            />
                            <Button size="sm" className="">
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
                                    <Star className="h-4 w-4 text-primary" />
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
                        <div className="grid grid-cols-3 gap-2 sm:gap-4">
                            <div className={`${STAT_TILE} text-center flex-1`}>
                                <div className="flex justify-center mb-1">
                                    <MapPin className="h-5 w-5 text-primary" />
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
                            <Link href="/leaderboard" className={`${STAT_TILE} text-center flex-1 transition-colors hover:bg-raised`}>
                                <div className="flex justify-center mb-1">
                                    <Trophy className="h-5 w-5 text-[rgb(var(--ll-warning))]" />
                                </div>
                                <div className="font-bold text-xl">{completedChallenges.length}</div>
                                <div className="text-xs text-muted-foreground">{completedChallenges.length === 1 ? "Badge" : "Badges"} earned</div>
                            </Link>
                        </div>
                    </div>

                    {/* CTAs */}
                    <div className="mt-4 flex gap-2 pt-4">
                        <Link href="/leaderboard" className="flex-1">
                            <Button variant="outline" className="w-full gap-2 bg-raised hover:bg-[rgb(var(--ll-warning)/0.15)] ">
                                <Trophy className="h-4 w-4 text-[rgb(var(--ll-warning))]" />
                                Leaderboard
                            </Button>
                        </Link>
                        <Link href="/challenges" className="flex-1">
                            <Button variant="outline" className="w-full gap-2 bg-raised hover:bg-primary/10 ">
                                <Star className="h-4 w-4 text-primary" />
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
                        ? ""
                        : subscription.tier === "pro"
                        ? ""
                        : ""
                }`}>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${
                                    subscription.tier === "premium"
                                        ? "bg-[rgb(var(--ll-warning)/0.14)]"
                                        : subscription.tier === "pro"
                                        ? "bg-primary/15"
                                        : "bg-raised"
                                }`}>
                                    <TierIcon className={`h-5 w-5 ${
                                        subscription.tier === "premium"
                                            ? "text-[rgb(var(--ll-warning))]"
                                            : subscription.tier === "pro"
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }`} />
                                </div>
                                <div>
                                    <CardTitle className="text-lg">{planLabel}</CardTitle>
                                    <CardDescription>
                                        {subscription.tier === "free"
                                            ? "Pro or Premium is required for the full Localley app"
                                            : subscription.status === "lifetime_premium"
                                            ? "Lifetime · included"
                                            : `$${tierConfig.price}/month`}
                                    </CardDescription>
                                </div>
                            </div>
                            {subscription.tier === "free" && (
                                <Badge variant="secondary" className="bg-primary/15 text-foreground">
                                    Plan required
                                </Badge>
                            )}
                            {subscription.tier !== "free" && isActiveSub && (
                                <Badge variant="secondary" className="bg-[rgb(var(--ll-success)/0.12)] text-[rgb(var(--ll-success))]">
                                    Active
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {subscription.tier === "free" ? (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    Pick Pro or Premium to activate richer AI planning, exact addresses, booking deals, and trip exports.
                                </p>
                                <div className="flex gap-2">
                                    <Link href="/pricing" className="flex-1">
                                        <Button className="w-full bg-primary text-primary-foreground">
                                            <Rocket className="h-4 w-4 mr-2" />
                                            Choose Pro
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
                                    <Badge variant="outline" className="text-[rgb(var(--ll-warning))] ">
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
                        <CardDescription>
                            {subscription.tier === "free"
                                ? "Activity tracking starts after plan activation"
                                : "Here's what you've been up to"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {subscription.tier === "free" ? (
                            <div className="rounded-xl bg-raised p-4 text-sm leading-6 text-muted-foreground">
                                Choose Pro or Premium to start planning with Localley. Your saved trips, chats, images, and spot collection will appear here.
                            </div>
                        ) : (
                        <>
                        {/* Itineraries - contextual messaging */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-primary" />
                                    <span>
                                        {usage.itinerariesThisMonth === 0
                                            ? "No trips planned yet this month"
                                            : `${usage.itinerariesThisMonth} ${usage.itinerariesThisMonth === 1 ? "trip" : "trips"} planned this month`}
                                    </span>
                                </div>
                                {tierConfig.limits.itinerariesPerMonth !== 999 && (
                                    <span className="text-xs text-muted-foreground">
                                        {remainingCount(usage.itinerariesThisMonth, tierConfig.limits.itinerariesPerMonth)} left
                                    </span>
                                )}
                            </div>
                            <Progress
                                value={usagePercent(usage.itinerariesThisMonth, tierConfig.limits.itinerariesPerMonth)}
                                className="h-2"
                            />
                        </div>

                        {/* Chat Messages - conversational */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4 text-primary" />
                                    <span>
                                        {usage.chatMessagesToday === 0
                                            ? "Chat with Alley anytime"
                                            : `${usage.chatMessagesToday} ${usage.chatMessagesToday === 1 ? "chat" : "chats"} today`}
                                    </span>
                                </div>
                                {tierConfig.limits.chatMessagesPerDay !== 999 && (
                                    <span className="text-xs text-muted-foreground">
                                        {remainingCount(usage.chatMessagesToday, tierConfig.limits.chatMessagesPerDay)} left today
                                    </span>
                                )}
                            </div>
                            <Progress
                                value={usagePercent(usage.chatMessagesToday, tierConfig.limits.chatMessagesPerDay)}
                                className="h-2"
                            />
                        </div>

                        {/* AI Images - achievement framing */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4 text-primary" />
                                    <span>
                                        {usage.aiImagesThisMonth === 0
                                            ? "Create AI images of your trips"
                                            : `${usage.aiImagesThisMonth} ${usage.aiImagesThisMonth === 1 ? "image" : "images"} created`}
                                    </span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                    {remainingCount(usage.aiImagesThisMonth, tierConfig.limits.aiImagesPerMonth)} left
                                </span>
                            </div>
                            <Progress
                                value={usagePercent(usage.aiImagesThisMonth, tierConfig.limits.aiImagesPerMonth)}
                                className="h-2"
                            />
                        </div>

                        {/* Saved Spots - collection framing */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <Bookmark className="h-4 w-4 text-primary" />
                                    <span>
                                        {usage.savedSpots === 0
                                            ? "Save spots you want to visit"
                                            : `${usage.savedSpots} ${usage.savedSpots === 1 ? "spot" : "spots"} in your collection`}
                                    </span>
                                </div>
                                {tierConfig.limits.savedSpotsLimit !== 999 && (
                                    <span className="text-xs text-muted-foreground">
                                        {remainingCount(usage.savedSpots, tierConfig.limits.savedSpotsLimit)} slots left
                                    </span>
                                )}
                            </div>
                            <Progress
                                value={usagePercent(usage.savedSpots, tierConfig.limits.savedSpotsLimit)}
                                className="h-2"
                            />
                        </div>
                        </>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Content Tabs */}
            <Tabs defaultValue="achievements" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-raised backdrop-blur-xl lg:w-[400px]">
                    <TabsTrigger value="achievements">Achievements</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="saved">Saved</TabsTrigger>
                </TabsList>

                <TabsContent value="achievements" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* First Steps Achievement */}
                        <Card className={`${LIQUID_CARD_SOFT} transition-all hover:bg-raised`}>
                            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                <div className="h-12 w-12 rounded-full bg-[rgb(var(--ll-warning)/0.15)] flex items-center justify-center">
                                    <Trophy className="h-6 w-6 text-[rgb(var(--ll-warning))]" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">First Steps</CardTitle>
                                    <p className="text-xs text-muted-foreground">Joined Localley</p>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Badge variant="secondary" className="bg-[rgb(var(--ll-success)/0.12)] text-green-600 hover:bg-[rgb(var(--ll-success)/0.12)]">
                                    Completed
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-2">Earned {joinedDate}</p>
                            </CardContent>
                        </Card>

                        {/* Display completed challenges */}
                        {completedChallenges.filter((userChallenge) => userChallenge.challenges).slice(0, 5).map((userChallenge) => (
                            <Card
                                key={userChallenge.challenge_id}
                                className={`${LIQUID_CARD_SOFT} transition-all hover:bg-raised`}
                            >
                                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Star className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-base">{userChallenge.challenges!.name}</CardTitle>
                                        <p className="text-xs text-muted-foreground">{userChallenge.challenges!.description}</p>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Badge variant="secondary" className="bg-[rgb(var(--ll-success)/0.12)] text-green-600 hover:bg-[rgb(var(--ll-success)/0.12)]">
                                        Completed
                                    </Badge>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        +{userChallenge.challenges!.xp_reward} XP
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

                                return (
                                    <Link key={itinerary.id} href={`/itineraries/${itinerary.id}`} className="group block h-full">
                                        <Card className={`h-full overflow-hidden transition-all hover:-translate-y-1 flex flex-col ${LIQUID_CARD_SOFT}`}>
                                            {/* Gradient Header */}
                                            <div className="relative h-24 overflow-hidden bg-raised">
                                                <CityImageAvatar
                                                    city={itinerary.city}
                                                    className="absolute inset-0 h-full w-full rounded-none"
                                                    imageClassName="transition duration-500 group-hover:scale-105"
                                                    sizes="(max-width: 768px) 100vw, 33vw"
                                                    imageWidth={900}
                                                    quality={90}
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />
                                                <div className="absolute bottom-2 left-3 right-3 flex justify-between items-end">
                                                    <Badge className="bg-raised text-primary hover:bg-white">
                                                        {itinerary.city}
                                                    </Badge>
                                                    <span className="text-muted-foreground text-xs">{itinerary.days} days</span>
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
                                        <Card className={`h-full overflow-hidden transition-all hover:-translate-y-1 flex flex-col ${LIQUID_CARD_SOFT}`}>
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
                                                <Badge className="absolute top-2 left-2 bg-primary backdrop-blur-sm">
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
