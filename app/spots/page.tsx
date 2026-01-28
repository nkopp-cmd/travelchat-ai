import { Suspense } from "react";
import { SpotsExplorer } from "@/components/spots/spots-explorer";
import { SpotCardSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MapPin, Sparkles } from "lucide-react";
import { AppBackground } from "@/components/layout/app-background";
import { GradientText } from "@/components/ui/gradient-text";
import {
    fetchFilteredSpots,
    fetchFilterOptions,
    parseFilterParams,
    SpotsFilterParams,
} from "@/lib/spots";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Discover Hidden Gems",
    description: "Find local favorites across Seoul, Tokyo, Bangkok, and Singapore. Curated spots rated by locals.",
};

// Enable dynamic rendering for URL-based filtering
export const dynamic = "force-dynamic";

interface SpotsPageProps {
    searchParams: Promise<SpotsFilterParams>;
}

/**
 * Loading skeleton for spots grid
 */
function SpotsLoading() {
    return (
        <div className="space-y-6">
            {/* Filter bar skeleton */}
            <div className="p-4 rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-black/5 dark:border-white/10">
                <div className="h-11 bg-white/50 dark:bg-white/5 rounded-lg animate-pulse mb-4" />
                <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-8 w-20 bg-white/50 dark:bg-white/5 rounded-full animate-pulse" />
                    ))}
                </div>
            </div>
            {/* Grid skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <SpotCardSkeleton key={i} />
                ))}
            </div>
        </div>
    );
}

/**
 * City Coverage Stats Component
 */
async function CityCoverageStats() {
    const filterOptions = await fetchFilterOptions();
    const totalSpots = filterOptions.cities.reduce((sum, c) => sum + c.count, 0);

    return (
        <div className="flex flex-wrap items-center gap-3">
            {filterOptions.cities.map((city) => (
                <Badge
                    key={city.slug}
                    variant="secondary"
                    className="px-3 py-1.5 text-sm bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10 hover:border-violet-300/50 dark:hover:border-violet-500/30 transition-colors"
                >
                    <span className="mr-1.5">{city.emoji}</span>
                    <span className="font-medium">{city.name}</span>
                    <span className="ml-1.5 text-muted-foreground">
                        {city.count} spots
                    </span>
                </Badge>
            ))}
            <Badge
                variant="outline"
                className="px-3 py-1.5 text-sm border-dashed bg-white/50 dark:bg-white/5 backdrop-blur-sm"
            >
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-violet-500" />
                {totalSpots} total curated spots
            </Badge>
        </div>
    );
}

/**
 * Server component that fetches spots based on URL filters
 */
async function SpotsContent({
    searchParams,
}: {
    searchParams: SpotsFilterParams;
}) {
    const filters = parseFilterParams(searchParams);

    const [spotsData, filterOptions] = await Promise.all([
        fetchFilteredSpots(filters),
        fetchFilterOptions(),
    ]);

    return (
        <SpotsExplorer
            initialSpots={spotsData.spots}
            totalCount={spotsData.total}
            currentPage={spotsData.page}
            pageSize={spotsData.pageSize}
            hasMore={spotsData.hasMore}
            filterOptions={filterOptions}
            currentFilters={filters}
        />
    );
}

/**
 * Spots Page - Server Component with URL-based filtering
 *
 * Supports these URL parameters:
 * - city: "seoul", "tokyo", "bangkok", "singapore"
 * - category: "Food", "Cafe", "Nightlife", "Shopping", "Outdoor", "Market"
 * - score: "6", "5", "4", "3"
 * - sort: "score", "trending", "local"
 * - search: free text search
 * - page: pagination
 *
 * Example: /spots?city=seoul&category=Food&page=2
 */
export default async function SpotsPage({ searchParams }: SpotsPageProps) {
    const params = await searchParams;

    return (
        <AppBackground ambient className="min-h-screen">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8 space-y-4">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10 text-violet-700 dark:text-violet-400 text-sm font-medium mb-3">
                            <MapPin className="h-4 w-4" />
                            Asia-First Discovery
                        </div>
                        <h1 className="text-4xl font-bold mb-2">
                            <GradientText variant="violet">
                                Discover Hidden Gems
                            </GradientText>
                        </h1>
                        <p className="text-muted-foreground">
                            Curated local favorites where neighborhood culture matters most
                        </p>
                    </div>

                    {/* City Coverage Stats */}
                    <Suspense
                        fallback={
                            <div className="flex gap-2">
                                {[1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="h-8 w-32 bg-white/50 dark:bg-white/5 backdrop-blur-sm animate-pulse rounded-full"
                                    />
                                ))}
                            </div>
                        }
                    >
                        <CityCoverageStats />
                    </Suspense>
                </div>

                {/* Main Content - Re-mount on filter change via key */}
                <Suspense key={JSON.stringify(params)} fallback={<SpotsLoading />}>
                    <SpotsContent searchParams={params} />
                </Suspense>
            </div>
        </AppBackground>
    );
}
