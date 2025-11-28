import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlassCard, GlassCardContent, GlassCardHeader } from "@/components/ui/glass-card";
import { BentoGrid, BentoItem } from "@/components/ui/bento-grid";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatCard } from "@/components/ui/stat-card";
import { GlowBadge } from "@/components/ui/glow-badge";
import { Trophy, Star, MapPin, Flame, Settings, Share2, Sparkles, Calendar, Target } from "lucide-react";
import { getLevel, getNextLevelXp, getLevelProgress, getRankTitle } from "@/lib/gamification";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";

async function getUserProgress() {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const supabase = createSupabaseAdmin();

    // Get user progress from Supabase
    const { data: progress } = await supabase
        .from("user_progress")
        .select("*")
        .eq("clerk_user_id", userId)
        .single();

    // Get user's completed challenges
    const { data: completedChallenges } = await supabase
        .from("user_challenges")
        .select("*, challenges(*)")
        .eq("clerk_user_id", userId)
        .eq("completed", true);

    // Get user's saved itineraries count
    const { data: itineraries } = await supabase
        .from("itineraries")
        .select("id")
        .eq("clerk_user_id", userId);

    return {
        progress: progress || { xp: 0, level: 1, streak: 0, discoveries: 0 },
        completedChallenges: completedChallenges || [],
        itinerariesCount: itineraries?.length || 0,
    };
}

export default async function ProfilePage() {
    const user = await currentUser();

    if (!user) {
        redirect("/sign-in");
    }

    const { progress, completedChallenges, itinerariesCount } = await getUserProgress();

    const level = getLevel(progress.xp);
    const levelProgress = getLevelProgress(progress.xp);
    const rank = getRankTitle(level);
    const nextLevelXp = getNextLevelXp(level);

    // Calculate user stats
    const joinedDate = new Date(user.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
    });

    return (
        <div className="min-h-screen">
            {/* Animated gradient background */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-violet-500/20 to-transparent rounded-full blur-3xl animate-blob" />
                <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/20 to-transparent rounded-full blur-3xl animate-blob animation-delay-2000" />
                <div className="absolute -bottom-1/2 left-1/4 w-full h-full bg-gradient-radial from-purple-500/20 to-transparent rounded-full blur-3xl animate-blob animation-delay-4000" />
            </div>

            <div className="max-w-5xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
                {/* Profile Header - Glassmorphism */}
                <GlassCard variant="gradient" hover={false} className="overflow-hidden">
                    {/* Gradient banner */}
                    <div className="h-32 bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 relative">
                        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20" />
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
                    </div>

                    <div className="px-6 md:px-8 pb-6">
                        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-end -mt-16 mb-6 gap-4">
                            <div className="flex items-end gap-4 md:gap-6">
                                {/* Avatar with glow ring */}
                                <div className="relative">
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 blur-lg opacity-50 animate-pulse" />
                                    <Avatar className="h-28 w-28 border-4 border-background shadow-2xl relative">
                                        <AvatarImage src={user.imageUrl} />
                                        <AvatarFallback className="text-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                                            {user.firstName?.[0]}{user.lastName?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    {/* Level badge on avatar */}
                                    <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-lg">
                                        Lv.{level}
                                    </div>
                                </div>

                                <div className="mb-2">
                                    <div className="flex items-center gap-2">
                                        <h1 className="text-2xl md:text-3xl font-bold">
                                            {user.firstName} {user.lastName}
                                        </h1>
                                        <GlowBadge variant="gold" size="sm">
                                            {rank}
                                        </GlowBadge>
                                    </div>
                                    <p className="text-muted-foreground">
                                        @{user.username || user.emailAddresses[0].emailAddress.split("@")[0]}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        Joined {joinedDate}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20">
                                    <Settings className="mr-2 h-4 w-4" />
                                    Edit Profile
                                </Button>
                                <Button size="sm" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25">
                                    <Share2 className="mr-2 h-4 w-4" />
                                    Share
                                </Button>
                            </div>
                        </div>
                    </div>
                </GlassCard>

                {/* Bento Grid Stats Section */}
                <BentoGrid columns={4}>
                    {/* Large XP Card */}
                    <BentoItem colSpan={2} rowSpan={2}>
                        <GlassCard variant="glow" hover={false} className="h-full flex flex-col justify-center items-center p-6">
                            <div className="flex flex-col items-center gap-4">
                                <ProgressRing value={levelProgress} size="xl" gradientId="level-progress">
                                    <div className="flex flex-col items-center">
                                        <Sparkles className="h-6 w-6 text-violet-500 mb-1" />
                                        <span className="text-2xl font-bold">{level}</span>
                                        <span className="text-xs text-muted-foreground">Level</span>
                                    </div>
                                </ProgressRing>
                                <div className="text-center">
                                    <p className="text-lg font-semibold">{progress.xp.toLocaleString()} XP</p>
                                    <p className="text-sm text-muted-foreground">
                                        {(nextLevelXp - progress.xp).toLocaleString()} XP to Level {level + 1}
                                    </p>
                                </div>
                            </div>
                        </GlassCard>
                    </BentoItem>

                    {/* Discoveries */}
                    <BentoItem>
                        <StatCard
                            icon={MapPin}
                            label="Discoveries"
                            value={progress.discoveries || 0}
                            iconColor="text-emerald-500"
                            size="md"
                            className="h-full"
                        />
                    </BentoItem>

                    {/* Day Streak */}
                    <BentoItem>
                        <StatCard
                            icon={Flame}
                            label="Day Streak"
                            value={progress.streak || 0}
                            iconColor="text-orange-500"
                            size="md"
                            className="h-full"
                        />
                    </BentoItem>

                    {/* Badges */}
                    <BentoItem>
                        <StatCard
                            icon={Trophy}
                            label="Badges"
                            value={completedChallenges.length}
                            iconColor="text-yellow-500"
                            size="md"
                            className="h-full"
                        />
                    </BentoItem>

                    {/* Itineraries */}
                    <BentoItem>
                        <StatCard
                            icon={Target}
                            label="Itineraries"
                            value={itinerariesCount}
                            iconColor="text-blue-500"
                            size="md"
                            className="h-full"
                        />
                    </BentoItem>
                </BentoGrid>

                {/* Content Tabs */}
                <Tabs defaultValue="achievements" className="w-full">
                    <TabsList className="w-full md:w-auto bg-white/10 backdrop-blur-xl border border-white/20 p-1 rounded-xl">
                        <TabsTrigger
                            value="achievements"
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg"
                        >
                            <Trophy className="h-4 w-4 mr-2" />
                            Achievements
                        </TabsTrigger>
                        <TabsTrigger
                            value="history"
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg"
                        >
                            <Calendar className="h-4 w-4 mr-2" />
                            History
                        </TabsTrigger>
                        <TabsTrigger
                            value="saved"
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white rounded-lg"
                        >
                            <Star className="h-4 w-4 mr-2" />
                            Saved
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="achievements" className="mt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* First Steps Achievement */}
                            <GlassCard variant="gradient" className="group">
                                <GlassCardHeader className="flex flex-row items-center gap-4 pb-2">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-md group-hover:blur-lg transition-all" />
                                        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center relative shadow-lg">
                                            <Trophy className="h-7 w-7 text-white" />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-semibold">First Steps</h3>
                                        <p className="text-xs text-muted-foreground">Joined Localley</p>
                                    </div>
                                </GlassCardHeader>
                                <GlassCardContent>
                                    <div className="flex items-center justify-between">
                                        <GlowBadge variant="success">Completed</GlowBadge>
                                        <p className="text-xs text-muted-foreground">Earned {joinedDate}</p>
                                    </div>
                                </GlassCardContent>
                            </GlassCard>

                            {/* Display completed challenges */}
                            {completedChallenges.slice(0, 5).map((userChallenge, index) => (
                                <GlassCard
                                    key={userChallenge.id}
                                    variant="gradient"
                                    className="group"
                                    animated
                                    style={{ animationDelay: `${(index + 1) * 100}ms` }}
                                >
                                    <GlassCardHeader className="flex flex-row items-center gap-4 pb-2">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-violet-500/30 rounded-full blur-md group-hover:blur-lg transition-all" />
                                            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center relative shadow-lg">
                                                <Star className="h-7 w-7 text-white" />
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-semibold">{userChallenge.challenges.title}</h3>
                                            <p className="text-xs text-muted-foreground line-clamp-1">
                                                {userChallenge.challenges.description}
                                            </p>
                                        </div>
                                    </GlassCardHeader>
                                    <GlassCardContent>
                                        <div className="flex items-center justify-between">
                                            <GlowBadge variant="success">Completed</GlowBadge>
                                            <span className="text-xs font-medium text-violet-400">
                                                +{userChallenge.challenges.xp_reward} XP
                                            </span>
                                        </div>
                                    </GlassCardContent>
                                </GlassCard>
                            ))}

                            {/* Streak Achievement (In Progress) */}
                            {progress.streak < 7 && (
                                <GlassCard
                                    variant="subtle"
                                    className="opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300 group"
                                >
                                    <GlassCardHeader className="flex flex-row items-center gap-4 pb-2">
                                        <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                                            <Flame className="h-7 w-7 text-muted-foreground group-hover:text-orange-500 transition-colors" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-semibold">On Fire</h3>
                                            <p className="text-xs text-muted-foreground">Maintain a 7 Day Streak</p>
                                        </div>
                                    </GlassCardHeader>
                                    <GlassCardContent>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-muted-foreground">Progress</span>
                                                <span>{progress.streak} / 7 Days</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
                                                    style={{ width: `${(progress.streak / 7) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </GlassCardContent>
                                </GlassCard>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="history">
                        <GlassCard variant="subtle" hover={false}>
                            <GlassCardContent className="py-12">
                                <div className="text-center">
                                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                                    <p className="text-muted-foreground">
                                        {itinerariesCount > 0
                                            ? `You have ${itinerariesCount} saved ${itinerariesCount === 1 ? "itinerary" : "itineraries"}`
                                            : "No history yet. Start exploring!"}
                                    </p>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </TabsContent>

                    <TabsContent value="saved">
                        <GlassCard variant="subtle" hover={false}>
                            <GlassCardContent className="py-12">
                                <div className="text-center">
                                    <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                                    <p className="text-muted-foreground">
                                        Saved spots feature coming soon!
                                    </p>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
