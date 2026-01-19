import { Suspense } from "react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Spot, MultiLanguageField } from "@/types";
import { SpotsExplorer } from "@/components/spots/spots-explorer";
import { SpotCardSkeleton } from "@/components/ui/skeleton";
import { getCitySpotCounts } from "@/lib/city-stats";
import { Badge } from "@/components/ui/badge";
import { MapPin, Sparkles } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Discover Hidden Gems",
    description: "Find local favorites across Seoul, Tokyo, Bangkok, and Singapore. Curated spots rated by locals.",
};

// Supabase spot raw type
interface RawSpot {
    id: string;
    name: MultiLanguageField;
    description: MultiLanguageField;
    address: MultiLanguageField;
    category: string | null;
    subcategories: string[] | null;
    location: {
        coordinates: [number, number];
    } | null;
    localley_score: number | null;
    local_percentage: number | null;
    best_time: string | null;
    photos: string[] | null;
    image_url: string | null;
    tips: string[] | null;
    verified: boolean | null;
    trending_score: number;
}

/**
 * Parse multi-language field to string
 */
function getLocalizedText(field: MultiLanguageField): string {
    if (typeof field === "object" && field !== null) {
        return field.en || Object.values(field)[0] || "";
    }
    return field || "";
}

/**
 * Transform raw Supabase spot to application Spot type
 */
function transformSpot(spot: RawSpot): Spot {
    const lat = spot.location?.coordinates?.[1] || 0;
    const lng = spot.location?.coordinates?.[0] || 0;

    return {
        id: spot.id,
        name: getLocalizedText(spot.name),
        description: getLocalizedText(spot.description),
        category: spot.category || "Uncategorized",
        subcategories: spot.subcategories || [],
        location: {
            lat,
            lng,
            address: getLocalizedText(spot.address)
        },
        localleyScore: spot.localley_score || 3,
        localPercentage: spot.local_percentage || 50,
        bestTime: spot.best_time || "Anytime",
        photos: spot.photos || [spot.image_url || "/placeholder-spot.svg"],
        tips: spot.tips || [],
        verified: spot.verified || false,
        trending: spot.trending_score > 0.7 || false
    };
}

/**
 * Fetch spots from database (server-side)
 */
async function getSpots(): Promise<{ spots: Spot[]; count: number }> {
    const supabase = createSupabaseAdmin();

    const { data: spotsData, error, count } = await supabase
        .from("spots")
        .select("*", { count: "exact" })
        .order("localley_score", { ascending: false })
        .limit(50);

    if (error || !spotsData) {
        console.error("[spots/page] Error fetching spots:", error);
        return { spots: [], count: 0 };
    }

    const spots = spotsData.map((spot: RawSpot) => transformSpot(spot));
    return { spots, count: count || spots.length };
}

/**
 * Loading skeleton for spots
 */
function SpotsLoading() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {[...Array(6)].map((_, i) => (
                <SpotCardSkeleton key={i} />
            ))}
        </div>
    );
}

/**
 * Server component for spots page content
 */
async function SpotsContent() {
    const { spots, count } = await getSpots();

    return (
        <SpotsExplorer
            initialSpots={spots}
            totalCount={count}
        />
    );
}

/**
 * City Coverage Stats Component
 */
async function CityCoverageStats() {
    const cityCounts = await getCitySpotCounts();
    const totalSpots = cityCounts.reduce((sum, c) => sum + c.spotCount, 0);

    return (
        <div className="flex flex-wrap items-center gap-3">
            {cityCounts.map((city) => (
                <Badge
                    key={city.slug}
                    variant="secondary"
                    className="px-3 py-1.5 text-sm bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-100 dark:border-violet-800/30"
                >
                    <span className="mr-1.5">{city.emoji}</span>
                    <span className="font-medium">{city.name}</span>
                    <span className="ml-1.5 text-muted-foreground">
                        {city.spotCount} spots
                    </span>
                </Badge>
            ))}
            <Badge
                variant="outline"
                className="px-3 py-1.5 text-sm border-dashed"
            >
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-violet-500" />
                {totalSpots} total curated spots
            </Badge>
        </div>
    );
}

/**
 * Spots Page - Server Component
 *
 * Fetches initial spots data on the server for faster initial load and SEO.
 * Filtering and sorting is handled client-side for interactivity.
 */
export default function SpotsPage() {
    return (
        <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8 space-y-4">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 text-sm font-medium mb-3">
                        <MapPin className="h-4 w-4" />
                        Asia-First Discovery
                    </div>
                    <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                        Discover Hidden Gems
                    </h1>
                    <p className="text-muted-foreground">
                        Curated local favorites where neighborhood culture matters most
                    </p>
                </div>

                {/* City Coverage Stats */}
                <Suspense fallback={
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-8 w-32 bg-muted animate-pulse rounded-full" />
                        ))}
                    </div>
                }>
                    <CityCoverageStats />
                </Suspense>
            </div>

            <Suspense fallback={<SpotsLoading />}>
                <SpotsContent />
            </Suspense>
        </div>
    );
}
