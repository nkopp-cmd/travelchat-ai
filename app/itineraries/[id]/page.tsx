import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, ArrowLeft, Lightbulb, Bus, MessageSquare, Edit2, Navigation } from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ShareDialog } from "@/components/itineraries/share-dialog";
import { EmailDialog } from "@/components/itineraries/email-dialog";
import { StoryDialog } from "@/components/itineraries/story-dialog";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { ItineraryActivityCard } from "@/components/activities/itinerary-activity-card";
import { ViatorSuggestions } from "@/components/activities/viator-suggestions";
import { AppBackground } from "@/components/layout/app-background";
import { HeroSection } from "@/components/itinerary/hero-section";
import { auth } from "@clerk/nextjs/server";
import { getUserTier } from "@/lib/usage-tracking";
import { SubscriptionTier } from "@/lib/subscription";
import { validateCityForItinerary } from "@/lib/cities";
import { getDisplayCity } from "@/lib/city-images";
import { isKoreanCity } from "@/hooks/use-map-provider";
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

/**
 * Resolve city name — handles "Unknown City" from chat-saved itineraries
 * by trying to extract city from the title using known cities list.
 */
function resolveCity(itinerary: { city: string; title: string }): string {
    if (itinerary.city && itinerary.city.toLowerCase() !== "unknown city" && itinerary.city.trim() !== "") {
        return itinerary.city;
    }
    // Try extracting from title
    const validation = validateCityForItinerary(itinerary.title);
    if (validation.valid && validation.city) return validation.city.name;
    return getDisplayCity(itinerary.city);
}

// Generate route URL for a day's activities
// Korea → Kakao Maps (Google Maps has limited data there), everywhere else → Google Maps
function getDayRouteUrl(activities: ItineraryActivity[], city: string): string {
    const activitiesWithAddress = activities.filter(a => a.address);
    if (activitiesWithAddress.length === 0) return "";

    // Korean cities: use Kakao Maps (which has full Korea coverage)
    if (isKoreanCity(city)) {
        const firstActivity = activitiesWithAddress[0];
        return `https://map.kakao.com/link/search/${encodeURIComponent(`${firstActivity.address}, ${city}`)}`;
    }

    // All other cities: use Google Maps with multi-waypoint routing
    const waypoints = activitiesWithAddress
        .map(a => encodeURIComponent(`${a.address}, ${city}`));

    if (waypoints.length === 1) {
        return `https://www.google.com/maps/search/?api=1&query=${waypoints[0]}`;
    }

    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const middleWaypoints = waypoints.slice(1, -1);

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (middleWaypoints.length > 0) {
        url += `&waypoints=${middleWaypoints.join("|")}`;
    }
    url += "&travelmode=walking";

    return url;
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

// Get user's subscription tier
async function getUserSubscriptionTier(): Promise<SubscriptionTier> {
    try {
        const { userId } = await auth();
        if (!userId) return "free";
        return await getUserTier(userId);
    } catch {
        return "free";
    }
}

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
    const [itinerary, userTier] = await Promise.all([
        getItinerary(id),
        getUserSubscriptionTier(),
    ]);

    if (!itinerary) {
        notFound();
    }

    // Resolve city name (handles "Unknown City" from chat-saved itineraries)
    const displayCity = resolveCity(itinerary);

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

            <AppBackground ambient fitParent>
            <div className="max-w-5xl mx-auto space-y-8 p-4 pb-16">
                {/* Back Button */}
                <Link
                    href="/itineraries"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Itineraries
                </Link>

            {/* Hero Section */}
            <HeroSection
                title={itinerary.title}
                subtitle={itinerary.subtitle}
                city={displayCity}
                days={itinerary.days}
                localScore={itinerary.localScore ? itinerary.localScore * 10 : undefined}
                highlights={itinerary.highlights}
                className="rounded-2xl overflow-hidden"
            />

            {/* Action Bar */}
            <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/itineraries/${itinerary.id}/edit`}>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Edit2 className="h-4 w-4" />
                        Edit
                    </Button>
                </Link>
                <Link href={`/dashboard?itinerary=${itinerary.id}&title=${encodeURIComponent(itinerary.title)}&city=${encodeURIComponent(displayCity)}&days=${itinerary.days}`}>
                    <Button size="sm" className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                        <MessageSquare className="h-4 w-4" />
                        Revise with Alley
                    </Button>
                </Link>
                <a href={`/api/itineraries/${itinerary.id}/export`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        Export
                    </Button>
                </a>
                <ShareDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} />
                <EmailDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} />
                <StoryDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} totalDays={itinerary.days} city={displayCity} dailyPlans={dailyPlans} />
            </div>

            {/* Interactive Map */}
            <div className="space-y-4">
                {Array.isArray(dailyPlans) && dailyPlans.length > 0 && (
                    <ItineraryMap
                        city={displayCity}
                        dailyPlans={dailyPlans}
                    />
                )}
            </div>

            {/* Daily Plans */}
            <div className="space-y-8">
                {Array.isArray(dailyPlans) && dailyPlans.map((dayPlan: DayPlan, dayIndex: number) => {
                    const activities = dayPlan.activities || [];

                    return (
                        <Card key={dayIndex} className="overflow-hidden border-black/5 dark:border-white/10 shadow-lg bg-white/70 dark:bg-white/5 backdrop-blur-md">
                            {/* Day Header */}
                            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-6">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-2xl font-bold">Day {dayPlan.day || dayIndex + 1}</h2>
                                    <div className="flex items-center gap-2">
                                        {getDayRouteUrl(activities, displayCity) && (
                                            <a
                                                href={getDayRouteUrl(activities, displayCity)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    className="bg-white/20 text-white hover:bg-white/30 border-0 gap-1.5"
                                                >
                                                    <Navigation className="h-4 w-4" />
                                                    {isKoreanCity(displayCity) ? "View in Kakao Maps" : "View Route"}
                                                </Button>
                                            </a>
                                        )}
                                        <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30">
                                            {activities.length} Activities
                                        </Badge>
                                    </div>
                                </div>
                                {dayPlan.theme && (
                                    <p className="text-violet-100 text-lg">{dayPlan.theme}</p>
                                )}
                            </div>

                            <CardContent className="p-6 space-y-6">
                                {/* Activities Timeline with Enhanced Cards */}
                                <div className="space-y-2">
                                    {activities.map((activity: ItineraryActivity, activityIndex: number) => (
                                        <ItineraryActivityCard
                                            key={activityIndex}
                                            activity={activity}
                                            city={displayCity}
                                            userTier={userTier}
                                            isLast={activityIndex === activities.length - 1}
                                        />
                                    ))}
                                </div>

                                <Separator />

                                {/* Day Tips */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {dayPlan.localTip && (
                                        <div className="p-4 rounded-xl bg-yellow-50/80 dark:bg-yellow-950/20 border border-yellow-200/50 dark:border-yellow-900/30 backdrop-blur-sm">
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
                                        <div className="p-4 rounded-xl bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30 backdrop-blur-sm">
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
                    <Card className="bg-white/70 dark:bg-white/5 backdrop-blur-md border-black/5 dark:border-white/10">
                        <CardContent className="pt-6">
                            <p className="text-muted-foreground text-center py-8">
                                No activities planned yet. Start exploring!
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Viator Activity Suggestions */}
            <ViatorSuggestions
                city={displayCity}
                userTier={userTier}
                limit={4}
            />

            {/* Footer Actions */}
            <Card className="bg-white/70 dark:bg-white/5 backdrop-blur-md border-black/5 dark:border-white/10 shadow-lg shadow-violet-500/5">
                <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div>
                            <h3 className="font-semibold mb-1">Love this itinerary?</h3>
                            <p className="text-sm text-muted-foreground">Share it with friends or save it for later</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <ShareDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} />
                            <EmailDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} />
                            <StoryDialog itineraryId={itinerary.id} itineraryTitle={itinerary.title} totalDays={itinerary.days} city={displayCity} dailyPlans={dailyPlans} />
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
        </AppBackground>
        </>
    );
}
