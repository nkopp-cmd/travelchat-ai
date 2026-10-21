import { Suspense } from "react";
import { IntentLink } from "@/components/navigation/intent-link";
import { PageEyebrow } from "@/components/layout/page-header";
import { SpotsExplorer } from "@/components/spots/spots-explorer";
import { SpotCardSkeleton } from "@/components/ui/skeleton";
import { CityQuickFilters } from "@/components/spots/city-quick-filters";
import { WeeklyTrendingSpots } from "@/components/spots/weekly-trending-spots";
import { Images, MapPin, Plus } from "@/components/ui/icons";
import { AppBackground } from "@/components/layout/app-background";
import { GradientText } from "@/components/ui/gradient-text";
import { CityImageAvatar } from "@/components/ui/city-image";
import { Button } from "@/components/ui/button";
import {
    fetchFilteredSpots,
    fetchFilterOptions,
    parseFilterParams,
    SpotsFilterParams,
} from "@/lib/spots";
import type { Metadata } from "next";
import { fetchWeeklyTrendingSpots } from "@/lib/spots/weekly-trending";

export const metadata: Metadata = {
    title: "Discover Hidden Gems",
    description: "Find local favorites across Seoul, Tokyo, Bangkok, and Singapore. Curated spots rated by locals.",
};

// Enable dynamic rendering for URL-based filtering
export const dynamic = "force-dynamic";

const socialSpotSubmissionsEnabled =
    process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED === "true";

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
            <div className="rounded-2xl bg-surface p-4 shadow-surface">
                <div className="h-11 animate-pulse rounded-lg bg-white/10 mb-4" />
                <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-white/10" />
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
 * City Coverage Stats Component - Server wrapper for client CityQuickFilters
 * Fetches filter options on server, passes to interactive client component
 */
async function CityCoverageStats() {
    const filterOptions = await fetchFilterOptions();
    const totalSpots = filterOptions.cities.reduce((sum, c) => sum + c.count, 0);

    return (
        <CityQuickFilters
            cities={filterOptions.cities}
            totalSpots={totalSpots}
        />
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

    const [spotsData, filterOptions, weeklyTrending] = await Promise.all([
        fetchFilteredSpots(filters),
        fetchFilterOptions(),
        fetchWeeklyTrendingSpots(filters.city),
    ]);

    return (
        <>
            <WeeklyTrendingSpots items={weeklyTrending} citySlug={filters.city} />
            <SpotsExplorer
                initialSpots={spotsData.spots}
                totalCount={spotsData.total}
                currentPage={spotsData.page}
                pageSize={spotsData.pageSize}
                hasMore={spotsData.hasMore}
                filterOptions={filterOptions}
                currentFilters={filters}
            />
        </>
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
        <AppBackground ambient fitParent>
            <div className="container mx-auto px-4 pb-24 pt-6 md:pb-10 md:pt-8">
                {/* Header */}
                <div className="mb-6 space-y-4 md:mb-8">
                    <div className="relative overflow-hidden rounded-2xl bg-surface p-5 shadow-surface md:p-7">
                        <div className="absolute right-3 top-3 hidden -space-x-3 sm:flex">
                            {["Seoul", "Tokyo", "Bangkok", "Singapore"].map((city) => (
                                <CityImageAvatar
                                    key={city}
                                    city={city}
                                    className="h-14 w-14 rounded-lg "
                                    imageClassName="saturate-110"
                                    imageWidth={240}
                                    quality={90}
                                    sizes="56px"
                                />
                            ))}
                        </div>
                        <div className="relative max-w-2xl">
                            <PageEyebrow icon={MapPin} className="mb-3">Asia-First Discovery</PageEyebrow>
                            <h1 className="mb-2 text-3xl font-bold tracking-tight md:text-4xl">
                                <GradientText variant="violet">
                                    Discover Hidden Gems
                                </GradientText>
                            </h1>
                            <p className="text-[15px] leading-6 text-muted-foreground">
                                Browse local-first restaurants, alleys, markets, cafes, and night spots across Asia. Pick a city, filter by vibe, then save the places worth building a trip around.
                            </p>
                            <Button asChild className="mt-4"><IntentLink href="/itineraries/new">Start with a city</IntentLink></Button>
                            {socialSpotSubmissionsEnabled && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button asChild variant="secondary">
                                        <IntentLink href="/spots/submit">
                                            <Plus className="h-4 w-4" />
                                            Submit post
                                        </IntentLink>
                                    </Button>
                                    <Button asChild variant="ghost">
                                        <IntentLink href="/spots/submissions">
                                            <Images className="h-4 w-4" />
                                            Track submissions
                                        </IntentLink>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* City Coverage Stats */}
                    <Suspense
                        fallback={
                            <div className="flex gap-2">
                                {[1, 2, 3, 4].map((i) => (
                                    <div
                                        key={i}
                                        className="h-9 w-32 animate-pulse rounded-full bg-white/10 backdrop-blur-sm"
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
