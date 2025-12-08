import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, MapPin, Clock, DollarSign, Star, ArrowLeft, Lightbulb, Bus, Sparkles, MessageSquare, Edit2 } from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ShareDialog } from "@/components/itineraries/share-dialog";
import { EmailDialog } from "@/components/itineraries/email-dialog";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import type { Metadata } from "next";

// Type definitions for itinerary data
interface ItineraryActivity {
    name: string;
    description?: string;
    time?: string;
    duration?: string;
    cost?: string;
    address?: string;
    type?: string;
    category?: string;
    localleyScore?: number;
    image?: string;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: ItineraryActivity[];
    localTip?: string;
    transportTips?: string;
    highlights?: string[];
}

// Fetch itinerary from Supabase
async function getItinerary(id: string) {
    const supabase = createSupabaseAdmin();

    const { data: itinerary, error } = await supabase
        .from("itineraries")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !itinerary) {
        console.error("Error fetching itinerary:", error);
        return null;
    }

    return {
        id: itinerary.id,
        title: itinerary.title,
        subtitle: itinerary.subtitle,
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

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const itinerary = await getItinerary(id);

    if (!itinerary) {
        return {
            title: 'Itinerary Not Found - Localley',
            description: 'The requested itinerary could not be found.',
        };
    }

    const title = `${itinerary.title} - Localley`;
    const description = itinerary.highlights && itinerary.highlights.length > 0
        ? `Discover ${itinerary.city} with ${itinerary.days} ${itinerary.days === 1 ? 'day' : 'days'} of authentic local experiences. ${itinerary.highlights.slice(0, 3).join(' • ')}`
        : `Explore ${itinerary.city} with a ${itinerary.days}-day local itinerary curated by Alley.`;

    const keywords = [
        itinerary.city,
        'travel itinerary',
        'local guide',
        'hidden gems',
        'travel planning',
        ...(itinerary.highlights || []),
    ].join(', ');

    return {
        title,
        description,
        keywords,
        openGraph: {
            title: itinerary.title,
            description,
            type: 'website',
            siteName: 'Localley',
            images: [
                {
                    url: `/api/og?title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(itinerary.city)}&days=${itinerary.days}`,
                    width: 1200,
                    height: 630,
                    alt: itinerary.title,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title: itinerary.title,
            description,
            images: [`/api/og?title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(itinerary.city)}&days=${itinerary.days}`],
        },
    };
}

export default async function ItineraryViewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const itinerary = await getItinerary(id);

    if (!itinerary) {
        notFound();
    }

    // Parse activities if they're stored as JSON
    const dailyPlans = typeof itinerary.activities === 'string'
        ? JSON.parse(itinerary.activities)
        : itinerary.activities;

    // Prepare JSON-LD structured data
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'TouristTrip',
        name: itinerary.title,
        description: itinerary.highlights && itinerary.highlights.length > 0
            ? itinerary.highlights.join(', ')
            : `A ${itinerary.days}-day travel itinerary for ${itinerary.city}`,
        touristType: 'Local experiences',
        itinerary: dailyPlans?.map((day: DayPlan) => ({
            '@type': 'TouristAttraction',
            name: day.theme || `Day ${day.day}`,
            description: day.activities?.map((a: ItineraryActivity) => a.name).join(', ') || '',
        })) || [],
    };

    return (
        <>
            {/* JSON-LD Structured Data */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <div className="max-w-5xl mx-auto space-y-8 p-4 pb-16">
                {/* Back Button */}
                <Link
                    href="/itineraries"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Itineraries
                </Link>

            {/* Header */}
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                            {itinerary.title}
                        </h1>
                        {itinerary.subtitle && (
                            <p className="text-lg text-muted-foreground">{itinerary.subtitle}</p>
                        )}
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
                            <span>•</span>
                            <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                <span>Local Score: {itinerary.localScore}/10</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 h-fit flex-wrap">
                        <Link href={`/itineraries/${itinerary.id}/edit`}>
                            <Button variant="outline" className="gap-2">
                                <Edit2 className="h-4 w-4" />
                                Edit
                            </Button>
                        </Link>
                        <Link href={`/dashboard?itinerary=${itinerary.id}&title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(itinerary.city)}&days=${itinerary.days}`}>
                            <Button className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                                <MessageSquare className="h-4 w-4" />
                                Revise with Alley
                            </Button>
                        </Link>
                        <ShareDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} />
                        <EmailDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} />
                        <a href={`/api/itineraries/${itinerary.id}/export`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" className="gap-2">
                                <Download className="h-4 w-4" />
                                Export
                            </Button>
                        </a>
                    </div>
                </div>

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

                {/* Interactive Map */}
                {Array.isArray(dailyPlans) && dailyPlans.length > 0 && (
                    <ItineraryMap
                        city={itinerary.city}
                        dailyPlans={dailyPlans}
                    />
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

                                                <div className="flex gap-4 pb-6">
                                                    {/* Activity Thumbnail */}
                                                    {activity.image && (
                                                        <div className="hidden sm:block flex-shrink-0">
                                                            <div className="relative w-24 h-24 rounded-lg overflow-hidden">
                                                                <Image
                                                                    src={activity.image}
                                                                    alt={activity.name}
                                                                    fill
                                                                    className="object-cover"
                                                                    sizes="96px"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex-1 space-y-3">
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
                                                                    {activity.category && (
                                                                        <Badge variant="secondary" className="text-xs">
                                                                            {activity.category}
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

                {/* Fallback if no activities */}
                {(!Array.isArray(dailyPlans) || dailyPlans.length === 0) && (
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-muted-foreground text-center py-8">
                                No activities planned yet. Start exploring!
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Footer Actions */}
            <Card className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200/50">
                <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <h3 className="font-semibold mb-1">Love this itinerary?</h3>
                            <p className="text-sm text-muted-foreground">Share it with friends or save it for later</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <ShareDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} />
                            <EmailDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} />
                            <a href={`/api/itineraries/${itinerary.id}/export`} target="_blank" rel="noopener noreferrer">
                                <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 gap-2">
                                    <Download className="h-4 w-4" />
                                    Download PDF
                                </Button>
                            </a>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
        </>
    );
}
