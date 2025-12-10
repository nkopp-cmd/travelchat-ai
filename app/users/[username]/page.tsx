import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    MapPin,
    Calendar,
    Star,
    Eye,
    Map,
    Award,
    ExternalLink,
    Sparkles,
} from "lucide-react";
import { LEVEL_THRESHOLDS } from "@/lib/gamification";

interface UserProfile {
    id: string;
    clerkId: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    bio: string | null;
    level: number;
    totalXp: number;
    title: string;
    joinedAt: string;
}

interface PublicItinerary {
    id: string;
    title: string;
    city: string;
    days: number;
    localScore: number;
    shareCode: string;
    viewCount: number;
    createdAt: string;
}

async function getUserProfile(username: string): Promise<UserProfile | null> {
    const supabase = createSupabaseAdmin();

    // Try to find user by username or clerk_id
    const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .or(`username.eq.${username},clerk_id.eq.${username}`)
        .single();

    if (error || !user) {
        return null;
    }

    // Get user progress for level/XP
    const { data: progress } = await supabase
        .from("user_progress")
        .select("level, total_xp, title")
        .eq("user_id", user.id)
        .single();

    return {
        id: user.id,
        clerkId: user.clerk_id,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        level: progress?.level || 1,
        totalXp: progress?.total_xp || 0,
        title: progress?.title || "Tourist",
        joinedAt: user.created_at,
    };
}

async function getUserItineraries(clerkId: string): Promise<PublicItinerary[]> {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
        .from("itineraries")
        .select("id, title, city, days, local_score, share_code, view_count, created_at")
        .eq("clerk_user_id", clerkId)
        .eq("shared", true)
        .not("share_code", "is", null)
        .order("created_at", { ascending: false })
        .limit(12);

    if (error) {
        console.error("Error fetching user itineraries:", error);
        return [];
    }

    return (data || []).map((item) => ({
        id: item.id,
        title: item.title,
        city: item.city,
        days: item.days,
        localScore: item.local_score || 0,
        shareCode: item.share_code,
        viewCount: item.view_count || 0,
        createdAt: item.created_at,
    }));
}

async function getUserStats(clerkId: string) {
    const supabase = createSupabaseAdmin();

    const [
        { count: totalItineraries },
        { count: sharedItineraries },
        { data: totalViews },
    ] = await Promise.all([
        supabase
            .from("itineraries")
            .select("*", { count: "exact", head: true })
            .eq("clerk_user_id", clerkId),
        supabase
            .from("itineraries")
            .select("*", { count: "exact", head: true })
            .eq("clerk_user_id", clerkId)
            .eq("shared", true),
        supabase
            .from("itineraries")
            .select("view_count")
            .eq("clerk_user_id", clerkId)
            .eq("shared", true),
    ]);

    const viewSum = (totalViews || []).reduce((sum, item) => sum + (item.view_count || 0), 0);

    return {
        totalItineraries: totalItineraries || 0,
        sharedItineraries: sharedItineraries || 0,
        totalViews: viewSum,
    };
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params;
    const profile = await getUserProfile(username);

    if (!profile) {
        return {
            title: "User Not Found | Localley",
        };
    }

    const displayName = profile.name || profile.username || "Traveler";

    return {
        title: `${displayName}'s Profile | Localley`,
        description: `View ${displayName}'s travel itineraries and discoveries on Localley. ${profile.bio || ""}`.trim(),
    };
}

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params;
    const profile = await getUserProfile(username);

    if (!profile) {
        notFound();
    }

    const [itineraries, stats] = await Promise.all([
        getUserItineraries(profile.clerkId),
        getUserStats(profile.clerkId),
    ]);

    const displayName = profile.name || profile.username || "Anonymous Traveler";
    const initials = displayName.slice(0, 2).toUpperCase();

    // Calculate level progress
    const currentLevelXp = LEVEL_THRESHOLDS[profile.level - 1] || 0;
    const nextLevelXp = LEVEL_THRESHOLDS[profile.level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const levelProgress = ((profile.totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50/50 via-white to-indigo-50/50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
            <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
                {/* Profile Header */}
                <Card className="overflow-hidden">
                    <div className="bg-gradient-to-r from-violet-600 to-indigo-600 h-32" />
                    <CardContent className="relative pt-0 pb-6">
                        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 -mt-12 sm:-mt-8">
                            <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                                <AvatarImage src={profile.avatarUrl || undefined} />
                                <AvatarFallback className="text-2xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 text-center sm:text-left space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <h1 className="text-2xl font-bold">{displayName}</h1>
                                    <Badge variant="secondary" className="w-fit mx-auto sm:mx-0">
                                        <Award className="h-3 w-3 mr-1" />
                                        {profile.title}
                                    </Badge>
                                </div>

                                {profile.bio && (
                                    <p className="text-muted-foreground">{profile.bio}</p>
                                )}

                                <p className="text-sm text-muted-foreground">
                                    Joined {formatDate(profile.joinedAt)}
                                </p>
                            </div>

                            <div className="text-center sm:text-right">
                                <div className="text-sm text-muted-foreground mb-1">Level {profile.level}</div>
                                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all"
                                        style={{ width: `${Math.min(levelProgress, 100)}%` }}
                                    />
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    {profile.totalXp.toLocaleString()} XP
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <Map className="h-6 w-6 mx-auto mb-2 text-violet-500" />
                            <div className="text-2xl font-bold">{stats.totalItineraries}</div>
                            <div className="text-sm text-muted-foreground">Itineraries</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <Sparkles className="h-6 w-6 mx-auto mb-2 text-indigo-500" />
                            <div className="text-2xl font-bold">{stats.sharedItineraries}</div>
                            <div className="text-sm text-muted-foreground">Shared</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <Eye className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
                            <div className="text-2xl font-bold">{stats.totalViews.toLocaleString()}</div>
                            <div className="text-sm text-muted-foreground">Views</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Public Itineraries */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Map className="h-5 w-5 text-violet-500" />
                            Shared Itineraries
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {itineraries.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {itineraries.map((itinerary) => (
                                    <Link
                                        key={itinerary.id}
                                        href={`/shared/${itinerary.shareCode}`}
                                        className="block"
                                    >
                                        <Card className="h-full hover:shadow-md transition-shadow border-border/40">
                                            <CardContent className="p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className="font-semibold line-clamp-1 hover:underline">
                                                        {itinerary.title}
                                                    </h3>
                                                    {itinerary.localScore > 0 && (
                                                        <Badge variant="secondary" className="shrink-0 ml-2">
                                                            <Star className="h-3 w-3 mr-1 fill-current text-yellow-500" />
                                                            {itinerary.localScore}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                                    <div className="flex items-center gap-1">
                                                        <MapPin className="h-3 w-3" />
                                                        <span>{itinerary.city}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        <span>{itinerary.days} days</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <Eye className="h-3 w-3" />
                                                        <span>{itinerary.viewCount}</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-muted-foreground">
                                <Map className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No shared itineraries yet</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* CTA for visitors */}
                <Card className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200/50">
                    <CardContent className="p-6 text-center">
                        <h3 className="text-lg font-semibold mb-2">
                            Want to share your own adventures?
                        </h3>
                        <p className="text-muted-foreground mb-4">
                            Join Localley and create beautiful itineraries to share with the world
                        </p>
                        <Link href="/sign-up">
                            <Button className="bg-gradient-to-r from-violet-600 to-indigo-600">
                                <Sparkles className="mr-2 h-4 w-4" />
                                Create Your Profile
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
