import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Star, MapPin, Flame, Settings, Share2, Heart } from "lucide-react";
import { getLevel, getNextLevelXp, getLevelProgress, getRankTitle } from "@/lib/gamification";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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

    // Get user's saved itineraries count (uses clerk_user_id)
    const { data: itineraries } = await supabase
        .from("itineraries")
        .select("id")
        .eq("clerk_user_id", userId);

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

    return {
        progress: mergedProgress,
        completedChallenges,
        itinerariesCount: itineraries?.length || 0,
        savedSpots: savedSpots || [],
    };
}

export default async function ProfilePage() {
    const user = await currentUser();

    if (!user) {
        redirect("/sign-in");
    }

    const { progress, completedChallenges, itinerariesCount, savedSpots } = await getUserProgress();

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
        <div className="max-w-4xl mx-auto p-4 space-y-8 animate-in fade-in duration-500">
            {/* Profile Header */}
            <div className="relative rounded-3xl overflow-hidden border border-border/40 bg-background/60 backdrop-blur-sm shadow-xl">
                <div className="h-32 bg-gradient-to-r from-violet-600 to-indigo-600" />
                <div className="px-8 pb-8">
                    <div className="relative flex flex-col md:flex-row justify-between items-start md:items-end -mt-12 mb-6 gap-4">
                        <div className="flex items-end gap-6">
                            <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                                <AvatarImage src={user.imageUrl} />
                                <AvatarFallback className="text-2xl bg-slate-200 dark:bg-slate-800">
                                    {user.firstName?.[0]}{user.lastName?.[0]}
                                </AvatarFallback>
                            </Avatar>
                            <div className="mb-1">
                                <h1 className="text-2xl font-bold">
                                    {user.firstName} {user.lastName}
                                </h1>
                                <p className="text-muted-foreground">
                                    @{user.username || user.emailAddresses[0].emailAddress.split("@")[0]}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 mb-1">
                            <Button variant="outline" size="sm">
                                <Settings className="mr-2 h-4 w-4" />
                                Edit Profile
                            </Button>
                            <Button size="sm" className="bg-violet-600 hover:bg-violet-700">
                                <Share2 className="mr-2 h-4 w-4" />
                                Share Profile
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm font-medium">
                                <span>Level {level}: {rank}</span>
                                <span className="text-muted-foreground">{progress.xp} / {nextLevelXp} XP</span>
                            </div>
                            <Progress value={levelProgress} className="h-3 bg-secondary" />
                            <p className="text-xs text-muted-foreground text-right">
                                {nextLevelXp - progress.xp} XP to next level
                            </p>
                        </div>

                        <div className="flex justify-between items-center gap-4">
                            <div className="text-center p-3 rounded-xl bg-accent/5 flex-1">
                                <div className="flex justify-center mb-1">
                                    <MapPin className="h-5 w-5 text-violet-500" />
                                </div>
                                <div className="font-bold text-xl">{progress.discoveries || 0}</div>
                                <div className="text-xs text-muted-foreground">Discoveries</div>
                            </div>
                            <div className="text-center p-3 rounded-xl bg-accent/5 flex-1">
                                <div className="flex justify-center mb-1">
                                    <Flame className="h-5 w-5 text-orange-500" />
                                </div>
                                <div className="font-bold text-xl">{progress.streak || 0}</div>
                                <div className="text-xs text-muted-foreground">Day Streak</div>
                            </div>
                            <Link href="/leaderboard" className="text-center p-3 rounded-xl bg-accent/5 flex-1 hover:bg-accent/10 transition-colors">
                                <div className="flex justify-center mb-1">
                                    <Trophy className="h-5 w-5 text-yellow-500" />
                                </div>
                                <div className="font-bold text-xl">{completedChallenges.length}</div>
                                <div className="text-xs text-muted-foreground">Badges</div>
                            </Link>
                        </div>
                    </div>

                    {/* Leaderboard CTA */}
                    <div className="mt-4 pt-4 border-t border-border/40">
                        <Link href="/leaderboard">
                            <Button variant="outline" className="w-full gap-2 hover:bg-yellow-500/10 hover:border-yellow-500/50">
                                <Trophy className="h-4 w-4 text-yellow-500" />
                                View Leaderboard
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Content Tabs */}
            <Tabs defaultValue="achievements" className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:w-[400px] bg-background/60 backdrop-blur-sm border border-border/40">
                    <TabsTrigger value="achievements">Achievements</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="saved">Saved</TabsTrigger>
                </TabsList>

                <TabsContent value="achievements" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* First Steps Achievement */}
                        <Card className="border-border/40 bg-background/60 backdrop-blur-sm hover:bg-accent/5 transition-all">
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
                                className="border-border/40 bg-background/60 backdrop-blur-sm hover:bg-accent/5 transition-all"
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
                            <Card className="border-border/40 bg-background/40 backdrop-blur-sm opacity-70 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
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
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-muted-foreground text-center py-8">
                                {itinerariesCount > 0
                                    ? `You have ${itinerariesCount} saved ${itinerariesCount === 1 ? "itinerary" : "itineraries"}`
                                    : "No history yet. Start exploring!"}
                            </p>
                        </CardContent>
                    </Card>
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
                                    <Link key={saved.id} href={`/spots/${spot.id}`}>
                                        <Card className="overflow-hidden transition-all hover:shadow-md hover:-translate-y-1 h-full flex flex-col border-border/40 bg-background/60 backdrop-blur-sm">
                                            <div className="relative aspect-video w-full overflow-hidden">
                                                <Image
                                                    src={spot.photos?.[0] || "/placeholder-spot.jpg"}
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
                        <Card className="border-border/40 bg-background/60 backdrop-blur-sm">
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
    );
}
