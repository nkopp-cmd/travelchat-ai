import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Home, Instagram } from "lucide-react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SharedActions } from "./shared-actions";
import { ItineraryJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { AppBackground } from "@/components/layout/app-background";
import { HeroSection } from "@/components/itinerary/hero-section";
import { ItineraryInsightsPanel } from "@/components/itinerary/itinerary-insights-panel";
import { DayRouteSection } from "@/components/itinerary/day-route-section";
import {
    normalizeDailyPlansForDisplay,
    parseDailyPlans,
} from "@/lib/itineraries/normalize-daily-plans";

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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localley.io";

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
    category?: string;
    localleyScore?: number;
    image?: string;
}

interface DayPlan {
    day: number;
    theme?: string;
    activities: ItineraryActivity[];
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

    // Parse story_slides if available and not expired
    let storySlides: Record<string, string> | null = null;
    const storyMeta = itinerary.story_slides as {
        generated_at: string;
        expires_at: string;
        tier: string;
        slides: Record<string, string>;
    } | null;

    if (storyMeta?.slides && new Date(storyMeta.expires_at) > new Date()) {
        storySlides = storyMeta.slides;
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
        storySlides,
    };
}

export default async function SharedItineraryPage({ params }: { params: Promise<{ shareCode: string }> }) {
    const { shareCode } = await params;
    const itinerary = await getSharedItinerary(shareCode);

    if (!itinerary) {
        notFound();
    }

    const { dailyPlans, insights: itineraryInsights } =
        normalizeDailyPlansForDisplay<DayPlan>(parseDailyPlans(itinerary.activities));

    return (
        <>
            {/* JSON-LD Structured Data */}
            <ItineraryJsonLd
                title={itinerary.title}
                description={itinerary.highlights?.join(". ")}
                city={itinerary.city}
                days={itinerary.days}
                highlights={itinerary.highlights}
                url={`/shared/${shareCode}`}
                createdAt={itinerary.createdAt}
                localScore={itinerary.localScore}
            />
            <BreadcrumbJsonLd
                items={[
                    { name: "Home", url: "/" },
                    { name: "Explore", url: "/explore" },
                    { name: itinerary.title, url: `/shared/${shareCode}` },
                ]}
            />

            <AppBackground ambient>
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

                    <HeroSection
                        title={itinerary.title}
                        city={itinerary.city}
                        days={itinerary.days}
                        localScore={itinerary.localScore ? itinerary.localScore * 10 : undefined}
                        highlights={itinerary.highlights}
                        className="overflow-hidden rounded-2xl"
                    />

                    {/* CTA Banner */}
                    <section className="rounded-xl border border-violet-300/15 bg-[#10081c]/82 p-3 shadow-2xl shadow-violet-950/20 backdrop-blur-xl sm:p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <h3 className="font-semibold leading-tight">Make this trip yours</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">Save the route, share it, or build a fresh one with real local spots.</p>
                                </div>
                                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                                    <SharedActions itineraryId={itinerary.id} shareCode={shareCode} />
                                    <Link href="/sign-up">
                                        <Button className="h-10 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20 hover:from-violet-700 hover:to-indigo-700">
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            Create mine
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                    </section>

                    {/* Story Slides Gallery */}
                    {itinerary.storySlides && Object.keys(itinerary.storySlides).length > 0 && (
                        <Card className="border-violet-200/50 overflow-hidden">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Instagram className="h-5 w-5 text-violet-600" />
                                    Story Slides
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                    {(() => {
                                        const slides = itinerary.storySlides!;
                                        const orderedKeys: string[] = [];
                                        if (slides.cover) orderedKeys.push("cover");
                                        for (let i = 1; i <= itinerary.days; i++) {
                                            if (slides[`day${i}`]) orderedKeys.push(`day${i}`);
                                        }
                                        if (slides.summary) orderedKeys.push("summary");

                                        return orderedKeys.map((key) => {
                                            const label = key === "cover" ? "Cover"
                                                : key === "summary" ? "Summary"
                                                : `Day ${key.replace("day", "")}`;
                                            return (
                                                <a
                                                    key={key}
                                                    href={slides[key]}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="group relative aspect-[9/16] rounded-xl overflow-hidden border border-border/50 hover:border-violet-400 transition-all hover:shadow-lg"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={slides[key]}
                                                        alt={`${label} - ${itinerary.title}`}
                                                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        loading="lazy"
                                                    />
                                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                                        <span className="text-white text-xs font-medium">{label}</span>
                                                    </div>
                                                </a>
                                            );
                                        });
                                    })()}
                                </div>
                                <p className="text-xs text-muted-foreground mt-3 text-center">
                                    Tap a slide to view full size
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                        {/* Itinerary-level Tips */}
                        <aside className="order-1 lg:order-2 lg:sticky lg:top-24">
                            <ItineraryInsightsPanel
                                insights={itineraryInsights}
                                title="Trip notes"
                                description="Practical tips and transport context stay outside the day schedule."
                                className="border-violet-300/15 bg-violet-950/[0.18]"
                            />
                        </aside>

                        {/* Daily Plans */}
                        <div className="order-2 space-y-4 sm:space-y-5 lg:order-1">
                            <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-200/70">
                                        Day schedule
                                    </p>
                                    <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl">
                                        Route by day
                                    </h2>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {dailyPlans.length} {dailyPlans.length === 1 ? "route day" : "route days"}
                                </p>
                            </div>
                            {dailyPlans.map((dayPlan: DayPlan, dayIndex: number) => (
                                <DayRouteSection
                                    key={dayIndex}
                                    dayPlan={dayPlan}
                                    dayIndex={dayIndex}
                                    city={itinerary.city}
                                    userTier="pro"
                                />
                            ))}
                        </div>
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
                                    Start planning
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
                </div>
            </AppBackground>
        </>
    );
}
