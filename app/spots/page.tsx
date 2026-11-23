import { PricingLineLink } from "@/components/seo/pricing-line";
import { cityHubDescription, SPOTS_INDEX_DESCRIPTION } from "@/lib/seo/hub-meta";
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
import { withHubCity } from "@/lib/spots/hub-city";
import { hubIndexable, spotsHubHeading } from "@/lib/seo/spot-indexable";
import { sitemapSpotRows } from "@/lib/seo/sitemap-spots";
import { homeHubLinks } from "@/lib/seo/home-links";
import { homeLinkRows } from "@/lib/seo/home-links-snapshot";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { pageMeta } from "@/lib/seo/meta";
import { spotsHubPagePath } from "@/lib/seo/spots-hub-page";
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
    const params = await searchParams;
    const hub = spotsHub(params);
    const { city } = hub;
    // Page 2+ is its own page for search engines (DA2): self canonical and its own title.
    const { path, titleSuffix: pageSuffix } = spotsHubPagePath(hub.path, params.page);
    // A hub with fewer than 5 guide spots is thin (F4): keep it live and followed, but out of the index.
    const thin = city ? !hubIndexable(await sitemapSpotRows().catch(() => []), city.name) : false;
    return city
        ? {
            ...pageMeta({
                title: `Hidden gems in ${city.name}: local spots${pageSuffix}`,
                description: cityHubDescription(city.name, city.country),
                path,
                image: city.heroImage,
            }),
            ...(thin ? { robots: { index: false, follow: true } } : {}),
        }
        : pageMeta({
            title: `Discover hidden gems and local spots${pageSuffix}`,
            description: SPOTS_INDEX_DESCRIPTION,
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
    const [spotsResult, filterOptions, weeklyTrending, viral, weather] = await Promise.all([
        fetchFilteredSpots(filters),
        fetchFilterOptions(),
        fetchWeeklyTrendingSpots(filters.city),
        fetchViralSpots(filters.city ?? null),
        city ? getWeather({ lat: city.center.lat, lng: city.center.lng, timeZone: city.timezone }) : null,
    ]);
    const spotsData = { ...spotsResult, spots: withHubCity(spotsResult.spots, city) };

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
                // With a rail above, grid cards start below the fold: lazy-load them (each eager Places photo is a billed call).
                cards={spotsData.spots.map((spot, index) => <SpotCard key={spot.id} spot={spot}
                    priority={index < 6 && viral.length === 0 && weeklyTrending.length === 0} />)}
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
                            {hub.city ? <PricingLineLink pageKey={hub.city.slug} className="mt-2 text-sm leading-6 text-muted-foreground" /> : null}
                            <Button asChild className="mt-4 min-h-11">
                                <IntentLink href={hub.city ? `/itineraries/new?${new URLSearchParams({ city: hub.city.name })}` : "/itineraries/new"} data-testid="hub-plan-trip">
                                    {hub.city ? `Plan a free ${hub.city.name} trip` : "Plan a free trip"}
                                </IntentLink>
                            </Button>
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
                    {/* Push BF2: body links to the template and viral-spot hubs (both had 0 contextual inbound links). */}
                    <p data-testid="hub-more-links" className="text-sm leading-6 text-muted-foreground">
                        Short on time?{" "}
                        <IntentLink href="/templates" className="font-semibold text-foreground underline underline-offset-2">
                            Start from a ready-made itinerary template
                        </IntentLink>
                        {" "}or{" "}
                        <IntentLink href="/trending" className="font-semibold text-foreground underline underline-offset-2">
                            see the viral spots in the news this month
                        </IntentLink>
                        .
                    </p>
                    {/* Push CL4: the A-Z list of each indexable hub had one inbound link (home); link them from /spots too. */}
                    {hub.city ? null : (
                        <nav aria-label="Spots A to Z by city" data-testid="hub-az-links" className="text-sm leading-6 text-muted-foreground">
                            Every spot A–Z:{" "}
                            {homeHubLinks(homeLinkRows()).map((link, i) => (
                                <span key={link.azHref}>
                                    {i > 0 ? " · " : null}
                                    <IntentLink href={link.azHref} className="font-semibold text-foreground underline underline-offset-2">
                                        {link.name}
                                    </IntentLink>
                                </span>
                            ))}
                        </nav>
                    )}
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
