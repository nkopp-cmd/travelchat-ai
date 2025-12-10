import Image from "next/image";
import { notFound } from "next/navigation";
import { LocalleyScale } from "@/types";
import { LocalleyScaleIndicator } from "@/components/spots/localley-scale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Users, Navigation, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";
import { SpotInteractions } from "@/components/spots/spot-interactions";
import { SpotActivities } from "@/components/spots/spot-activities";
import { ReviewList } from "@/components/spots/review-list";
import type { Metadata } from "next";

// Helper to parse multi-language fields
function getName(field: string | Record<string, string> | null | undefined): string {
    if (typeof field === "object" && field !== null) {
        return field.en || Object.values(field)[0] || "";
    }
    return field || "";
}

// Fetch spot data from Supabase
async function getSpot(id: string) {
    const supabase = createSupabaseAdmin();

    const { data: spot, error } = await supabase
        .from("spots")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !spot) {
        return null;
    }

    // Parse location coordinates
    const lat = spot.location?.coordinates?.[1] || 0;
    const lng = spot.location?.coordinates?.[0] || 0;
    const address = getName(spot.address);

    return {
        id: spot.id,
        name: getName(spot.name),
        description: getName(spot.description),
        location: { lat, lng, address },
        category: spot.category,
        subcategories: spot.subcategories || [],
        localleyScore: spot.localley_score as LocalleyScale,
        localPercentage: spot.local_percentage,
        bestTime: spot.best_times?.en || "Anytime",
        photos: spot.photos || ["/placeholder-spot.jpg"],
        tips: spot.tips?.en || [],
        verified: spot.verified,
        trending: spot.trending_score > 0.8,
    };
}

// Get score label for metadata
function getScoreLabel(score: LocalleyScale): string {
    if (score >= 6) return 'Legendary Local Spot';
    if (score >= 5) return 'Hidden Gem';
    if (score >= 4) return 'Local Favorite';
    return 'Popular Spot';
}

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const spot = await getSpot(id);

    if (!spot) {
        return {
            title: 'Spot Not Found - Localley',
            description: 'The requested spot could not be found.',
        };
    }

    const scoreLabel = getScoreLabel(spot.localleyScore);
    const title = `${spot.name} - ${scoreLabel} | Localley`;
    const description = `${spot.description.slice(0, 160)}... Localley Score: ${spot.localleyScore}/6 • ${spot.location.address}`;

    const keywords = [
        spot.name,
        spot.category,
        ...spot.subcategories,
        spot.location.address.split(',')[0].trim(),
        'local spots',
        'hidden gems',
        'travel guide',
    ].join(', ');

    return {
        title,
        description,
        keywords,
        openGraph: {
            title: spot.name,
            description: `${scoreLabel} - ${spot.description.slice(0, 100)}`,
            type: 'website',
            siteName: 'Localley',
            images: [
                {
                    url: spot.photos[0] || '/placeholder-spot.jpg',
                    width: 1200,
                    height: 630,
                    alt: spot.name,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title: spot.name,
            description: `${scoreLabel} - ${spot.description.slice(0, 150)}`,
            images: [spot.photos[0] || '/placeholder-spot.jpg'],
        },
    };
}

export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const spot = await getSpot(id);

    if (!spot) {
        notFound();
    }

    // Extract city from address for Viator activities
    const city = spot.location.address.split(',')[0].trim();

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
            <Link href="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Explore
            </Link>

            <div className="relative aspect-[21/9] w-full rounded-3xl overflow-hidden shadow-2xl">
                <Image
                    src={spot.photos[0] || "/placeholder-spot.jpg"}
                    alt={spot.name}
                    fill
                    className="object-cover"
                    priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                <div className="absolute bottom-0 left-0 p-8 w-full">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-4xl font-bold text-white">{spot.name}</h1>
                                {spot.verified && (
                                    <Badge variant="outline" className="border-green-400 text-green-400 bg-green-400/10 backdrop-blur-sm">Verified</Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-gray-300">
                                <MapPin className="h-4 w-4" />
                                <span>{spot.location.address}</span>
                            </div>
                        </div>

                        <SpotInteractions spotId={spot.id} spotName={spot.name} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="flex flex-wrap gap-2">
                        {spot.subcategories.map((sub: string) => (
                            <Badge key={sub} variant="secondary" className="px-3 py-1 text-sm bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                {sub}
                            </Badge>
                        ))}
                    </div>

                    <div className="prose dark:prose-invert max-w-none">
                        <p className="text-lg leading-relaxed text-muted-foreground">
                            {spot.description}
                        </p>
                    </div>

                    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 border border-violet-100 dark:border-violet-900/50 p-6 rounded-2xl space-y-6">
                        <h3 className="font-semibold flex items-center gap-2 text-lg">
                            <Users className="h-5 w-5 text-violet-600" />
                            Localley Insights
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="bg-white/50 dark:bg-white/5 p-4 rounded-xl">
                                <span className="text-sm text-muted-foreground block mb-1">Crowd Mix</span>
                                <div className="flex items-end gap-2">
                                    <span className="text-2xl font-bold text-violet-600">{spot.localPercentage}%</span>
                                    <span className="text-sm font-medium mb-1">Locals</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                                    <div className="bg-violet-600 h-1.5 rounded-full" style={{ width: `${spot.localPercentage}%` }} />
                                </div>
                            </div>
                            <div className="bg-white/50 dark:bg-white/5 p-4 rounded-xl">
                                <span className="text-sm text-muted-foreground block mb-1">Best Time</span>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-indigo-600" />
                                    <span className="font-medium">{spot.bestTime}</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <span className="text-sm font-medium text-muted-foreground block mb-3 uppercase tracking-wider">Insider Tips</span>
                            <ul className="space-y-3">
                                {spot.tips.map((tip: string, i: number) => (
                                    <li key={i} className="flex items-start gap-3 text-sm bg-white/60 dark:bg-white/5 p-3 rounded-lg">
                                        <div className="min-w-5 h-5 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold mt-0.5">
                                            {i + 1}
                                        </div>
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Viator Activities Section */}
                    <SpotActivities spotId={spot.id} city={city} spotName={spot.name} />

                    {/* Reviews Section */}
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">Reviews</h2>
                        <ReviewList spotId={spot.id} />
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="p-6 border border-border/40 bg-background/60 backdrop-blur-sm rounded-2xl shadow-sm space-y-6 sticky top-24">
                        <div>
                            <h3 className="font-semibold mb-4">Localley Score</h3>
                            <div className="flex justify-center py-4">
                                <LocalleyScaleIndicator score={spot.localleyScore} className="scale-125" />
                            </div>
                            <p className="text-sm text-center text-muted-foreground mt-2 px-4">
                                {spot.localleyScore === LocalleyScale.HIDDEN_GEM
                                    ? "A rare find! Mostly locals and very few tourists know about this spot."
                                    : "A great spot with a mix of people."}
                            </p>
                        </div>

                        <Link
                            href={`https://www.google.com/maps/dir/?api=1&destination=${spot.location.lat},${spot.location.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full"
                        >
                            <Button className="w-full h-12 text-lg bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-500/20 rounded-xl" size="lg">
                                <Navigation className="mr-2 h-5 w-5" />
                                Get Directions
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
