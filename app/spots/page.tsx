import { Suspense } from "react";
import { LocalleySignup } from "@/components/newsletter/localley-signup";
import { IntentLink } from "@/components/navigation/intent-link";
import { PageEyebrow } from "@/components/layout/page-header";
import { SpotsExplorer } from "@/components/spots/spots-explorer";
import { SpotCard } from "@/components/spots/spot-card";
import { SpotCardSkeleton } from "@/components/ui/skeleton";
import { CityQuickFilters } from "@/components/spots/city-quick-filters";
import { CityConditions } from "@/components/spots/city-conditions";
import { getCityBySlug } from "@/lib/cities";
import { spotsHubHeading } from "@/lib/seo/spot-indexable";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo/meta";
import { localMonth, seasonFor } from "@/lib/season/season-table";
import { getWeather } from "@/lib/weather/met-norway";
import { WeeklyTrendingSpots } from "@/components/spots/weekly-trending-spots";
import { CitySpotDirectory } from "@/components/spots/city-spot-directory";
import { ViralSpots } from "@/components/spots/viral-spots";
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
import { fetchViralSpots } from "@/lib/viral/events";
import { socialSpotSubmissionsAvailable } from "@/lib/social-submissions-availability";

// City hubs (/spots?city=<slug>) are sitemap URLs: their canonical keeps the city; other filters fold to the hub.
function spotsHub(params: SpotsFilterParams) {
    const city = params.city ? getCityBySlug(params.city) : undefined;
    return city
        ? { city, path: `/spots?city=${encodeURIComponent(city.slug)}` }
        : { city: undefined, path: "/spots" };
}

export async function generateMetadata({ searchParams }: SpotsPageProps): Promise<Metadata> {
    const { city, path } = spotsHub(await searchParams);
    return city
        ? pageMeta({
            title: `Hidden gems in ${city.name}: local spots`,
            description: `Hidden gems in ${city.name}, ${city.country}: cafes, food, bars and sights rated by locals with the Localley Score. Filter by area, category and what is open now.`,
            path,
            image: city.heroImage,
        })
        : pageMeta({
            title: "Discover hidden gems and local spots",
            description: "Local favorites in Seoul, Tokyo, Bangkok, Singapore and more Asian cities. Cafes, food, bars and sights rated by locals with the Localley Score.",
            path,
        });
}

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
 * Server component that fetches spots based on URL filters
 */
async function SpotsContent({
    searchParams,
}: {
    searchParams: SpotsFilterParams;
}) {
    const filters = parseFilterParams(searchParams);

    const city = filters.city ? getCityBySlug(filters.city) : undefined;
    // Weather comes from the edge cache or one capped MET request, in parallel with the spots.
    const [spotsData, filterOptions, weeklyTrending, viral, weather] = await Promise.all([
        fetchFilteredSpots(filters),
        fetchFilterOptions(),
        fetchWeeklyTrendingSpots(filters.city),
        fetchViralSpots(filters.city ?? null),
        city ? getWeather({ lat: city.center.lat, lng: city.center.lng, timeZone: city.timezone }) : null,
    ]);

    return (
        <>
            {city && (
                <CityConditions cityName={city.name} timeZone={city.timezone} weather={weather}
                    season={seasonFor(city.slug, localMonth(city.timezone))} />
            )}
            <ViralSpots items={viral} />
            <WeeklyTrendingSpots items={weeklyTrending} citySlug={filters.city} priority={viral.length === 0} />
            <SpotsExplorer
                // Only the map needs the full objects; grid and list get server HTML cards (saves ~56 KB of RSC per visit).
                initialSpots={searchParams.view === "map" ? spotsData.spots : []}
                spotCount={spotsData.spots.length}
                totalCount={spotsData.total}
                currentPage={spotsData.page}
                pageSize={spotsData.pageSize}
                hasMore={spotsData.hasMore}
                filterOptions={filterOptions}
                currentFilters={filters}
                cards={spotsData.spots.map((spot, index) => <SpotCard key={spot.id} spot={spot} priority={index < 6} />)}
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
    // Filter options are cached (10 min) and SpotsContent needs them too, so the shell waits for no extra round trip.
    const [params, filterOptions] = await Promise.all([searchParams, fetchFilterOptions()]);
    const hub = spotsHub(params);
    const heading = spotsHubHeading(hub.city);
    const totalSpots = filterOptions.cities.reduce((sum, c) => sum + c.count, 0);

    return (
        <AppBackground ambient fitParent>
            <BreadcrumbJsonLd
                items={[
                    { name: "Home", url: "/" },
                    { name: "Spots", url: "/spots" },
                    ...(hub.city ? [{ name: hub.city.name, url: hub.path }] : []),
                ]}
            />
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
                                    {heading.title}
                                </GradientText>
                            </h1>
                            <p className="text-[15px] leading-6 text-muted-foreground">
                                {heading.intro}
                            </p>
                            <Button asChild className="mt-4"><IntentLink href="/itineraries/new">Start with a city</IntentLink></Button>
                            {socialSpotSubmissionsAvailable() && (
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

                    {/* City chips render in the first HTML: a streamed fallback of another height shifted the page (PSI mobile CLS 0.39). */}
                    <CityQuickFilters cities={filterOptions.cities} totalSpots={totalSpots} />
                </div>

                {/* Main Content: no key, so a filter change keeps the current view (and the mounted map) until new results arrive. */}
                <Suspense fallback={<SpotsLoading />}>
                    <SpotsContent searchParams={params} />
                </Suspense>

                {hub.city ? (
                    <Suspense fallback={null}>
                        <CitySpotDirectory citySlug={hub.city.slug} cityName={hub.city.name} />
                    </Suspense>
                ) : null}

                <LocalleySignup source={hub.city ? "city-hub" : "spots"} city={hub.city?.slug} className="mt-10" />
            </div>
        </AppBackground>
    );
}
