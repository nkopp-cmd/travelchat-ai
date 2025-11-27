import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Star, MapPin, Flame, Settings, Share2 } from "lucide-react";
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
                            <div className="text-center p-3 rounded-xl bg-accent/5 flex-1">
                                <div className="flex justify-center mb-1">
                                    <Trophy className="h-5 w-5 text-yellow-500" />
                                </div>
                                <div className="font-bold text-xl">{completedChallenges.length}</div>
                                <div className="text-xs text-muted-foreground">Badges</div>
                            </div>
                        </div>
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
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-muted-foreground text-center py-8">
                                Saved spots feature coming soon!
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
