import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, Clock, DollarSign, Star, Lightbulb, Bus, Sparkles, Home } from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SharedActions } from "./shared-actions";

// Generate dynamic metadata for social sharing
export async function generateMetadata(
    { params }: { params: Promise<{ shareCode: string }> }
): Promise<Metadata> {
    const { shareCode } = await params;
    const supabase = createSupabaseAdmin();

    const { data: itinerary } = await supabase
        .from("itineraries")
        .select("title, city, days, highlights, local_score")
        .eq("share_code", shareCode)
        .eq("shared", true)
        .single();

    if (!itinerary) {
        return {
            title: "Itinerary Not Found | Localley",
        };
    }

    const title = `${itinerary.title} | Localley`;
    const description = itinerary.highlights?.length > 0
        ? `${itinerary.days}-day ${itinerary.city} itinerary featuring: ${itinerary.highlights.slice(0, 3).join(", ")}`
        : `Explore ${itinerary.city} with this ${itinerary.days}-day local-approved itinerary.`;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localley.app";

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            type: "article",
            url: `${baseUrl}/shared/${shareCode}`,
            siteName: "Localley",
            images: [
                {
                    url: `${baseUrl}/api/og?title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(itinerary.city)}&days=${itinerary.days}&score=${itinerary.local_score || 0}`,
                    width: 1200,
                    height: 630,
                    alt: itinerary.title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [`${baseUrl}/api/og?title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(itinerary.city)}&days=${itinerary.days}&score=${itinerary.local_score || 0}`],
        },
    };
}

// Type definitions
interface ItineraryActivity {
    name: string;
    description?: string;
    time?: string;
    duration?: string;
    cost?: string;
    address?: string;
    type?: string;
    localleyScore?: number;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: ItineraryActivity[];
    localTip?: string;
    transportTips?: string;
}

// Fetch shared itinerary by share code
async function getSharedItinerary(shareCode: string) {
    const supabase = createSupabaseAdmin();

    const { data: itinerary, error } = await supabase
        .from("itineraries")
        .select("*")
        .eq("share_code", shareCode)
        .eq("shared", true)
        .single();

    if (error || !itinerary) {
        console.error("Error fetching shared itinerary:", error);
        return null;
    }

    return {
        id: itinerary.id,
        title: itinerary.title,
        city: itinerary.city,
        days: itinerary.days,
        activities: itinerary.activities,
        localScore: itinerary.local_score,
        highlights: itinerary.highlights,
        estimatedCost: itinerary.estimated_cost,
        createdAt: itinerary.created_at,
    };
}

// Get icon for activity type
const getTypeIcon = (type: string) => {
    switch (type?.toLowerCase()) {
        case 'morning': return '🌅';
        case 'afternoon': return '☀️';
        case 'evening': return '🌆';
        default: return '📍';
    }
};

// Get Localley score badge
const getScoreBadge = (score: number) => {
    if (score >= 6) return { label: 'Legendary', color: 'bg-yellow-500' };
    if (score >= 5) return { label: 'Hidden Gem', color: 'bg-violet-500' };
    if (score >= 4) return { label: 'Local Favorite', color: 'bg-indigo-500' };
    return { label: 'Mixed Crowd', color: 'bg-blue-500' };
};

export default async function SharedItineraryPage({ params }: { params: Promise<{ shareCode: string }> }) {
    const { shareCode } = await params;
    const itinerary = await getSharedItinerary(shareCode);

    if (!itinerary) {
        notFound();
    }

    // Parse activities if they're stored as JSON
    const dailyPlans = typeof itinerary.activities === 'string'
        ? JSON.parse(itinerary.activities)
        : itinerary.activities;

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
            <div className="max-w-5xl mx-auto space-y-8 p-4 pb-16">
                {/* Header with branding */}
                <div className="flex items-center justify-between pt-4">
                    <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <Home className="h-4 w-4" />
                        Back to Localley
                    </Link>
                    <div className="text-right">
                        <div className="font-bold text-lg bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                            Localley
                        </div>
                        <p className="text-xs text-muted-foreground">Shared Itinerary</p>
                    </div>
                </div>

                {/* Itinerary Header */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                            {itinerary.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                <span>{itinerary.city}</span>
                            </div>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                <span>{itinerary.days} {itinerary.days === 1 ? 'Day' : 'Days'}</span>
                            </div>
                            {itinerary.localScore && (
                                <>
                                    <span>•</span>
                                    <div className="flex items-center gap-1">
                                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                        <span>Local Score: {itinerary.localScore}/10</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* CTA Banner */}
                    <Card className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border-violet-200/50">
                        <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="font-semibold mb-1">Love this itinerary?</h3>
                                    <p className="text-sm text-muted-foreground">Save it, share it, or create your own with Localley</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <SharedActions itineraryId={itinerary.id} shareCode={shareCode} />
                                    <Link href="/sign-up">
                                        <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            Create My Own
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Highlights Section */}
                    {itinerary.highlights && Array.isArray(itinerary.highlights) && itinerary.highlights.length > 0 && (
                        <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200/50">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Sparkles className="h-5 w-5 text-violet-600" />
                                    Trip Highlights
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {itinerary.highlights.map((highlight: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2 text-sm">
                                            <span className="text-violet-600 mt-0.5">✓</span>
                                            <span>{highlight}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Daily Plans */}
                <div className="space-y-8">
                    {Array.isArray(dailyPlans) && dailyPlans.map((dayPlan: DayPlan, dayIndex: number) => {
                        const activities = dayPlan.activities || [];

                        return (
                            <Card key={dayIndex} className="overflow-hidden border-border/40 shadow-lg">
                                {/* Day Header */}
                                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-6">
                                    <div className="flex items-center justify-between mb-2">
                                        <h2 className="text-2xl font-bold">Day {dayPlan.day || dayIndex + 1}</h2>
                                        <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30">
                                            {activities.length} Activities
                                        </Badge>
                                    </div>
                                    {dayPlan.theme && (
                                        <p className="text-violet-100 text-lg">{dayPlan.theme}</p>
                                    )}
                                </div>

                                <CardContent className="p-6 space-y-6">
                                    {/* Activities Timeline */}
                                    <div className="space-y-6">
                                        {activities.map((activity: ItineraryActivity, activityIndex: number) => {
                                            const scoreBadge = activity.localleyScore ? getScoreBadge(activity.localleyScore) : null;

                                            return (
                                                <div key={activityIndex} className="relative pl-8 border-l-2 border-violet-200 dark:border-violet-800">
                                                    {/* Timeline Dot */}
                                                    <div className="absolute -left-[9px] top-0">
                                                        <div className="w-4 h-4 rounded-full bg-violet-600 border-4 border-background" />
                                                    </div>

                                                    <div className="space-y-3 pb-6">
                                                        {/* Activity Header */}
                                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <h3 className="font-bold text-lg">{activity.name}</h3>
                                                                    {scoreBadge && (
                                                                        <Badge className={`${scoreBadge.color} text-white`}>
                                                                            {scoreBadge.label}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                {activity.address && (
                                                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                                        <MapPin className="h-3 w-3" />
                                                                        {activity.address}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap gap-2 text-sm">
                                                                {activity.time && (
                                                                    <Badge variant="outline" className="gap-1">
                                                                        <Clock className="h-3 w-3" />
                                                                        {activity.time}
                                                                    </Badge>
                                                                )}
                                                                {activity.type && (
                                                                    <Badge variant="outline">
                                                                        {getTypeIcon(activity.type)} {activity.type}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Activity Description */}
                                                        {activity.description && (
                                                            <p className="text-muted-foreground leading-relaxed">
                                                                {activity.description}
                                                            </p>
                                                        )}

                                                        {/* Activity Details */}
                                                        <div className="flex flex-wrap gap-4 text-sm">
                                                            {activity.duration && (
                                                                <div className="flex items-center gap-1 text-muted-foreground">
                                                                    <Clock className="h-4 w-4" />
                                                                    <span>{activity.duration}</span>
                                                                </div>
                                                            )}
                                                            {activity.cost && (
                                                                <div className="flex items-center gap-1 text-muted-foreground">
                                                                    <DollarSign className="h-4 w-4" />
                                                                    <span>{activity.cost}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <Separator />

                                    {/* Day Tips */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {dayPlan.localTip && (
                                            <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50">
                                                <div className="flex items-start gap-3">
                                                    <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                                                    <div>
                                                        <h4 className="font-semibold text-sm mb-1">Local Tip</h4>
                                                        <p className="text-sm text-muted-foreground">{dayPlan.localTip}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {dayPlan.transportTips && (
                                            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50">
                                                <div className="flex items-start gap-3">
                                                    <Bus className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                                                    <div>
                                                        <h4 className="font-semibold text-sm mb-1">Getting Around</h4>
                                                        <p className="text-sm text-muted-foreground">{dayPlan.transportTips}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Footer CTA */}
                <Card className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200/50">
                    <CardContent className="p-6">
                        <div className="text-center space-y-4">
                            <div>
                                <h3 className="text-2xl font-bold mb-2">Ready to discover your own hidden gems?</h3>
                                <p className="text-muted-foreground">Join Localley and create personalized itineraries for authentic local experiences</p>
                            </div>
                            <Link href="/sign-up">
                                <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                                    <Sparkles className="mr-2 h-5 w-5" />
                                    Get Started Free
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
