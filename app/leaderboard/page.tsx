import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, Medal, Award, Crown, ArrowLeft, Flame } from "lucide-react";
import { getRankTitle } from "@/lib/gamification";
import { createSupabaseAdmin } from "@/lib/supabase";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Leaderboard - Localley",
    description: "See the top explorers on Localley. Compete with friends and climb the ranks!",
};

interface LeaderboardUser {
    rank: number;
    id: string;
    clerk_id: string;
    username: string | null;
    xp: number;
    level: number;
    isCurrentUser: boolean;
}

async function getLeaderboard(): Promise<{
    leaderboard: LeaderboardUser[];
    currentUserRank: LeaderboardUser | null;
}> {
    const { userId } = await auth();
    const supabase = createSupabaseAdmin();

    // Get top 50 users
    const { data: users, error } = await supabase
        .from("users")
        .select("id, clerk_id, username, xp, level")
        .order("xp", { ascending: false })
        .limit(50);

    if (error) {
        console.error("Leaderboard error:", error);
        return { leaderboard: [], currentUserRank: null };
    }

    const leaderboard: LeaderboardUser[] = (users || []).map((user, index) => ({
        rank: index + 1,
        id: user.id,
        clerk_id: user.clerk_id,
        username: user.username,
        xp: user.xp || 0,
        level: user.level || 1,
        isCurrentUser: user.clerk_id === userId,
    }));

    // Find current user's rank if not in top 50
    let currentUserRank: LeaderboardUser | null = null;
    if (userId && !leaderboard.some((u) => u.isCurrentUser)) {
        const { data: currentUser } = await supabase
            .from("users")
            .select("id, clerk_id, username, xp, level")
            .eq("clerk_id", userId)
            .single();

        if (currentUser) {
            const { count } = await supabase
                .from("users")
                .select("*", { count: "exact", head: true })
                .gt("xp", currentUser.xp || 0);

            currentUserRank = {
                rank: (count || 0) + 1,
                id: currentUser.id,
                clerk_id: currentUser.clerk_id,
                username: currentUser.username,
                xp: currentUser.xp || 0,
                level: currentUser.level || 1,
                isCurrentUser: true,
            };
        }
    }

    return { leaderboard, currentUserRank };
}

function getRankIcon(rank: number) {
    switch (rank) {
        case 1:
            return <Crown className="h-6 w-6 text-yellow-500" />;
        case 2:
            return <Medal className="h-6 w-6 text-gray-400" />;
        case 3:
            return <Award className="h-6 w-6 text-amber-600" />;
        default:
            return <span className="text-lg font-bold text-muted-foreground w-6 text-center">{rank}</span>;
    }
}

function getRankBg(rank: number) {
    switch (rank) {
        case 1:
            return "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/30";
        case 2:
            return "bg-gradient-to-r from-gray-400/20 to-slate-400/20 border-gray-400/30";
        case 3:
            return "bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-amber-600/30";
        default:
            return "bg-background/60 border-border/40";
    }
}

function LeaderboardEntry({ user }: { user: LeaderboardUser }) {
    const rankTitle = getRankTitle(user.level);
    const displayName = user.username || `Explorer #${user.rank}`;

    return (
        <div
            className={`flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01] ${getRankBg(user.rank)} ${
                user.isCurrentUser ? "ring-2 ring-violet-500 ring-offset-2 ring-offset-background" : ""
            }`}
        >
            {/* Rank */}
            <div className="flex-shrink-0 w-10 flex justify-center">
                {getRankIcon(user.rank)}
            </div>

            {/* Avatar */}
            <Avatar className="h-12 w-12 border-2 border-background">
                <AvatarFallback className="bg-violet-500/20 text-violet-600 font-bold">
                    {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">
                        {displayName}
                        {user.isCurrentUser && (
                            <span className="text-violet-500 ml-1">(You)</span>
                        )}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary" className="text-xs">
                        Lv. {user.level}
                    </Badge>
                    <span>{rankTitle}</span>
                </div>
            </div>

            {/* XP */}
            <div className="text-right">
                <div className="font-bold text-lg">{user.xp.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">XP</div>
            </div>
        </div>
    );
}

function LeaderboardSkeleton() {
    return (
        <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-4 p-4 rounded-xl border bg-background/60 animate-pulse"
                >
                    <div className="w-10 h-6 bg-muted rounded" />
                    <div className="w-12 h-12 bg-muted rounded-full" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-32" />
                        <div className="h-3 bg-muted rounded w-24" />
                    </div>
                    <div className="space-y-1 text-right">
                        <div className="h-5 bg-muted rounded w-16" />
                        <div className="h-3 bg-muted rounded w-8" />
                    </div>
                </div>
            ))}
        </div>
    );
}

async function LeaderboardContent() {
    const { leaderboard, currentUserRank } = await getLeaderboard();

    if (leaderboard.length === 0) {
        return (
            <Card className="border-border/40 bg-background/60 backdrop-blur-sm">
                <CardContent className="pt-6">
                    <div className="text-center py-12">
                        <Trophy className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No explorers yet</h3>
                        <p className="text-muted-foreground">
                            Be the first to earn XP and claim the top spot!
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Top 3 Podium */}
            {leaderboard.length >= 3 && (
                <div className="grid grid-cols-3 gap-4 mb-8">
                    {/* Second Place */}
                    <div className="flex flex-col items-center pt-8">
                        <div className="relative">
                            <Avatar className="h-16 w-16 border-4 border-gray-400">
                                <AvatarFallback className="bg-gray-400/20 text-gray-600 font-bold text-xl">
                                    {(leaderboard[1]?.username || "E2").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-2 -right-2 bg-gray-400 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                                2
                            </div>
                        </div>
                        <span className="font-semibold mt-3 text-center text-sm truncate max-w-full">
                            {leaderboard[1]?.username || "Explorer #2"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                            {leaderboard[1]?.xp.toLocaleString()} XP
                        </span>
                    </div>

                    {/* First Place */}
                    <div className="flex flex-col items-center">
                        <Crown className="h-8 w-8 text-yellow-500 mb-2" />
                        <div className="relative">
                            <Avatar className="h-20 w-20 border-4 border-yellow-500">
                                <AvatarFallback className="bg-yellow-500/20 text-yellow-600 font-bold text-2xl">
                                    {(leaderboard[0]?.username || "E1").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                                1
                            </div>
                        </div>
                        <span className="font-bold mt-3 text-center truncate max-w-full">
                            {leaderboard[0]?.username || "Explorer #1"}
                        </span>
                        <span className="text-muted-foreground text-sm">
                            {leaderboard[0]?.xp.toLocaleString()} XP
                        </span>
                    </div>

                    {/* Third Place */}
                    <div className="flex flex-col items-center pt-12">
                        <div className="relative">
                            <Avatar className="h-14 w-14 border-4 border-amber-600">
                                <AvatarFallback className="bg-amber-600/20 text-amber-700 font-bold text-lg">
                                    {(leaderboard[2]?.username || "E3").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-2 -right-2 bg-amber-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                                3
                            </div>
                        </div>
                        <span className="font-semibold mt-3 text-center text-sm truncate max-w-full">
                            {leaderboard[2]?.username || "Explorer #3"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                            {leaderboard[2]?.xp.toLocaleString()} XP
                        </span>
                    </div>
                </div>
            )}

            {/* Full List */}
            <div className="space-y-3">
                {leaderboard.map((user) => (
                    <LeaderboardEntry key={user.id} user={user} />
                ))}
            </div>

            {/* Current user if not in top 50 */}
            {currentUserRank && (
                <div className="mt-6 pt-6 border-t border-dashed">
                    <p className="text-sm text-muted-foreground mb-3">Your Ranking</p>
                    <LeaderboardEntry user={currentUserRank} />
                </div>
            )}
        </div>
    );
}

export default function LeaderboardPage() {
    return (
        <div className="max-w-3xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
            {/* Back Button */}
            <Link
                href="/dashboard"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
            </Link>

            {/* Header */}
            <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-3">
                    <Trophy className="h-10 w-10 text-yellow-500" />
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 bg-clip-text text-transparent">
                        Leaderboard
                    </h1>
                </div>
                <p className="text-muted-foreground">
                    Top explorers competing for local legend status
                </p>
            </div>

            {/* Stats Banner */}
            <Card className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border-violet-500/20">
                <CardContent className="p-4">
                    <div className="flex items-center justify-center gap-2 text-sm">
                        <Flame className="h-4 w-4 text-orange-500" />
                        <span className="text-muted-foreground">
                            Earn XP by creating itineraries, saving spots, and exploring!
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* Leaderboard */}
            <Suspense fallback={<LeaderboardSkeleton />}>
                <LeaderboardContent />
            </Suspense>
        </div>
    );
}
