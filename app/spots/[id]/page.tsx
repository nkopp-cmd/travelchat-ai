import { notFound } from "next/navigation";
import { LocalleyScale } from "@/types";
import { LocalleyScaleIndicator } from "@/components/spots/localley-scale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ImageIcon, MapPin, Clock, Users, Navigation, ArrowLeft, Camera, Compass, Route, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";
import { SpotInteractions } from "@/components/spots/spot-interactions";
import { SpotActivities } from "@/components/spots/spot-activities";
import { ReviewList } from "@/components/spots/review-list";
import { SpotPhotoImage } from "@/components/spots/spot-photo-image";
import { SpotJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { getCityImageUrl } from "@/lib/city-images";
import { normalizeSpotPhotos } from "@/lib/spots/transform";
import { getGooglePlaceIdFromSpotPhotos, summarizeSpotPhotos } from "@/lib/place-images";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";
import { getSpotCoordinateValues } from "@/lib/spots/coordinates";
import { buildSpotDirectionsUrl, isKoreanLocation } from "@/lib/spots/map-links";
import { shouldShowPublicSpot } from "@/lib/spots/public-quality";
import {
    getSpotBestTime,
    getSpotDirectionsButtonLabel,
    normalizeLocalleyScore,
    normalizeLocalPercentage,
    normalizeSpotTips,
} from "@/lib/spots/detail-normalization";
import type { Metadata } from "next";

const LIQUID_CARD = "rounded-lg border border-violet-200/15 bg-[#100b1c]/86 shadow-lg shadow-violet-950/20 backdrop-blur-xl";
const SPOT_CITY_COORDS: Array<{ city: string; lat: [number, number]; lng: [number, number] }> = [
    { city: "Seoul", lat: [37.35, 37.75], lng: [126.75, 127.25] },
    { city: "Tokyo", lat: [35.45, 35.9], lng: [139.45, 140] },
    { city: "Bangkok", lat: [13.45, 14.1], lng: [100.25, 100.9] },
    { city: "Singapore", lat: [1.15, 1.5], lng: [103.55, 104.1] },
    { city: "Osaka", lat: [34.5, 34.85], lng: [135.25, 135.75] },
    { city: "Kyoto", lat: [34.85, 35.2], lng: [135.55, 136] },
    { city: "Busan", lat: [35, 35.35], lng: [128.85, 129.35] },
    { city: "Jeju", lat: [33.1, 33.65], lng: [126.05, 126.95] },
    { city: "Hong Kong", lat: [22.1, 22.6], lng: [113.75, 114.45] },
    { city: "Taipei", lat: [24.85, 25.25], lng: [121.25, 121.8] },
    { city: "Keelung", lat: [25, 25.25], lng: [121.6, 121.9] },
    { city: "Yilan", lat: [24.5, 24.95], lng: [121.55, 121.95] },
    { city: "Hanoi", lat: [20.8, 21.25], lng: [105.65, 106.15] },
    { city: "Ho Chi Minh", lat: [10.6, 11], lng: [106.45, 106.95] },
    { city: "Kuala Lumpur", lat: [2.95, 3.35], lng: [101.5, 101.85] },
    { city: "Bali", lat: [-8.9, -8.05], lng: [114.85, 115.65] },
];

const SPOT_LOCATION_KEYWORDS: Array<{ city: string; terms: string[] }> = [
    { city: "Kuala Lumpur", terms: ["jalan hang lekir", "petaling street", "bukit bintang", "chow kit"] },
    { city: "Bangkok", terms: ["don muang", "taopoon", "ari", "thonglor", "sukhumvit"] },
    { city: "Busan", terms: ["ilgwang", "haeundae", "gwangalli", "seomyeon"] },
    { city: "Kyoto", terms: ["gion", "arashiyama", "temple courtyard", "shrine"] },
    { city: "Keelung", terms: ["beining road", "badouzi", "miaokou", "heping island"] },
    { city: "Yilan", terms: ["wubin road", "wujie", "luodong", "jiaoxi", "dongshan"] },
    { city: "Seoul", terms: ["euljiro", "hongdae", "mullae", "haengdang", "hongje", "daebang", "hyehwa"] },
    { city: "Tokyo", terms: ["shinjuku", "kita city", "harmonica yokocho", "shimokitazawa", "koenji"] },
];

// Helper to parse multi-language fields
function getName(field: string | Record<string, string> | null | undefined): string {
    if (typeof field === "object" && field !== null) {
        return field.en || Object.values(field)[0] || "";
    }
    return field || "";
}

function getDirectionsHelperText(spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>): string {
    const isKorea = isKoreanLocation(spot.location.address);
    const locationConfidence = getLocationConfidence(spot);

    if (!isKorea && spot.googlePlaceId) {
        return "Maps opens with the matched Google Place ID from the spot photo source for a more precise destination.";
    }

    if (!isKorea && locationConfidence.tone === "exact") {
        return "Maps searches the exact spot name and address first instead of relying on imported coordinates alone.";
    }

    if (locationConfidence.tone === "area") {
        return isKorea
            ? "Kakao opens a name and area search because this source record does not have an exact address or usable coordinate pin yet."
            : "Maps opens a name and area search because this source record does not have an exact address or usable coordinate pin yet.";
    }

    return isKorea
        ? "Kakao uses the spot name and stored address before the imported coordinate pin."
        : "Maps uses the spot name and stored address before the imported coordinate pin.";
}

function getLocationPlanningCopy(spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>) {
    const confidence = getLocationConfidence(spot);

    if (spot.googlePlaceId && confidence.tone === "exact") {
        return {
            heading: "Plan this exact stop",
            description: "Matched place data gives this spot a reliable navigation target.",
            routeTitle: "Navigate with place match",
            locationHeading: "Exact location",
        };
    }

    if (confidence.tone === "exact") {
        return {
            heading: "Plan this exact stop",
            description: "The stored address is specific enough for maps to search directly.",
            routeTitle: "Navigate by name and address",
            locationHeading: "Exact location",
        };
    }

    if (confidence.tone === "pinned") {
        return {
            heading: "Plan this pinned area",
            description: "This is area-level source data with a saved map pin. Confirm the map context before you go.",
            routeTitle: "Route to saved area pin",
            locationHeading: "Pinned area",
        };
    }

    return {
        heading: "Plan this area carefully",
        description: "This record still needs exact address enrichment. Use the map result as a search starting point.",
        routeTitle: "Search by name and area",
        locationHeading: "Area-level location",
    };
}

function getSpotContextCity(spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>): string {
    const inferredCity = inferSpotCity(spot);
    if (inferredCity) return inferredCity;

    const addressParts = spot.location.address
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    return addressParts.at(-1) || spot.location.address;
}

function formatCoordinate(value: number) {
    return value ? value.toFixed(5) : null;
}

function isPlaceholderImage(src: string | undefined) {
    return !src || src.startsWith("/images/placeholders/") || src === "/placeholder-spot.svg" || src.includes("placeholder");
}

function inferSpotCity(spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>): string | null {
    const haystack = `${spot.name} ${spot.location.address}`.toLowerCase();
    const textMatch = SPOT_CITY_COORDS.find(({ city }) => haystack.includes(city.toLowerCase()));
    if (textMatch) return textMatch.city;

    const keywordMatch = SPOT_LOCATION_KEYWORDS.find(({ terms }) =>
        terms.some((term) => haystack.includes(term))
    );
    if (keywordMatch) return keywordMatch.city;

    const { lat, lng } = spot.location;
    const coordMatch = SPOT_CITY_COORDS.find(
        ({ lat: latRange, lng: lngRange }) =>
            lat >= latRange[0] && lat <= latRange[1] && lng >= lngRange[0] && lng <= lngRange[1]
    );

    return coordMatch?.city ?? null;
}

function getSpotHeroImage(spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>) {
    const photos = spot.photos as string[];
    const realPhoto = photos.find((photo: string) => !isPlaceholderImage(photo));
    if (realPhoto) return realPhoto;

    const city = inferSpotCity(spot);
    return city
        ? getCityImageUrl(city, { width: 1600, height: 900, quality: 90 }) ?? "/placeholder-spot.svg"
        : "/placeholder-spot.svg";
}

function getSpotFallbackImage(spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>) {
    const city = inferSpotCity(spot);
    return city
        ? getCityImageUrl(city, { width: 1600, height: 900, quality: 90 }) ?? "/placeholder-spot.svg"
        : "/placeholder-spot.svg";
}

function getSpotGalleryImages(spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>) {
    const photos = (spot.photos as string[]).filter((photo: string) => !isPlaceholderImage(photo));
    return photos.length > 1 ? photos.slice(1, 4) : [];
}

function getLocationConfidence(spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>) {
    return getSpotLocationConfidence({
        address: spot.location.address,
        lat: spot.location.lat,
        lng: spot.location.lng,
    });
}

function getScoreNarrative(score: LocalleyScale): string {
    if (score >= LocalleyScale.LEGENDARY_ALLEY) return "Almost entirely local energy with a strong reason to build a day around it.";
    if (score >= LocalleyScale.HIDDEN_GEM) return "A rare local-first find that still feels tucked away from the obvious routes.";
    if (score >= LocalleyScale.LOCAL_FAVORITE) return "A dependable neighborhood favorite with enough local signal to be worth a detour.";
    return "A useful stop with a mixed crowd and clear practical value for a nearby route.";
}

function getPrimaryArea(address: string, city: string): string {
    const parts = address
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);

    return parts.length > 1 ? parts[0] : city;
}

// Get Directions button component
function GetDirectionsButton({ spot }: { spot: NonNullable<Awaited<ReturnType<typeof getSpot>>> }) {
    const directionsUrl = buildSpotDirectionsUrl({
        name: spot.name,
        address: spot.location.address,
        lat: spot.location.lat,
        lng: spot.location.lng,
        googlePlaceId: spot.googlePlaceId,
    });
    const isKorea = isKoreanLocation(spot.location.address);
    const locationConfidence = getLocationConfidence(spot);

    return (
        <Link
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full"
        >
            <Button className="w-full h-12 text-lg bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-500/20 rounded-xl" size="lg">
                <Navigation className="mr-2 h-5 w-5" />
                {getSpotDirectionsButtonLabel(locationConfidence.tone, isKorea)}
            </Button>
        </Link>
    );
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

    const { lat, lng } = getSpotCoordinateValues(spot.location);
    const address = getName(spot.address);

    if (!shouldShowPublicSpot({ name: spot.name, address: spot.address, location: spot.location, photos: spot.photos })) {
        return null;
    }

    const normalizedPhotos = normalizeSpotPhotos(spot.photos, spot.category, 1600);
    const photoSummary = summarizeSpotPhotos(normalizedPhotos);

    return {
        id: spot.id,
        name: getName(spot.name),
        description: getName(spot.description),
        location: { lat, lng, address },
        category: spot.category || "Local spot",
        subcategories: spot.subcategories || [],
        localleyScore: normalizeLocalleyScore(spot.localley_score),
        localPercentage: normalizeLocalPercentage(spot.local_percentage),
        bestTime: getSpotBestTime(spot.best_times, spot.best_time),
        photos: normalizedPhotos,
        hasRealPhoto: photoSummary.hasRealPhoto,
        realPhotoCount: Object.entries(photoSummary.kinds).reduce(
            (count, [kind, value]) =>
                kind === "proxy" || kind === "remote_https" || kind === "local_asset"
                    ? count + value
                    : count,
            0
        ),
        googlePlaceId: spot.google_place_id || getGooglePlaceIdFromSpotPhotos(normalizedPhotos),
        tips: normalizeSpotTips(spot.tips),
        verified: Boolean(spot.verified),
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
    const imageUrl = getSpotHeroImage(spot);

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
                    url: imageUrl,
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
            images: [imageUrl],
        },
    };
}

export default async function SpotPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const spot = await getSpot(id);

    if (!spot) {
        notFound();
    }

    // Use city-level context for related activities; the first address segment is often a district.
    const city = getSpotContextCity(spot);
    const heroImage = getSpotHeroImage(spot);
    const fallbackImage = getSpotFallbackImage(spot);
    const galleryImages = getSpotGalleryImages(spot);
    const locationConfidence = getLocationConfidence(spot);
    const primaryArea = getPrimaryArea(spot.location.address, city);
    const scoreNarrative = getScoreNarrative(spot.localleyScore);
    const locationPlanningCopy = getLocationPlanningCopy(spot);

    return (
        <>
            {/* JSON-LD Structured Data */}
            <SpotJsonLd
                name={spot.name}
                description={spot.description}
                category={spot.category}
                address={spot.location.address}
                lat={spot.location.lat}
                lng={spot.location.lng}
                imageUrl={heroImage}
                url={`/spots/${id}`}
                localleyScore={spot.localleyScore}
            />
            <BreadcrumbJsonLd
                items={[
                    { name: "Home", url: "/" },
                    { name: "Spots", url: "/spots" },
                    { name: spot.name, url: `/spots/${id}` },
                ]}
            />

            <div className="mx-auto max-w-5xl space-y-5 pb-4 animate-in fade-in duration-500 md:space-y-8">
                <Link href="/spots" className="inline-flex min-h-10 items-center rounded-full border border-violet-200/15 bg-white/[0.055] px-3 text-sm text-violet-50/70 transition-colors hover:bg-violet-400/10 hover:text-white">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to spots
                </Link>

            <div className="relative aspect-[4/3] min-h-[300px] w-full overflow-hidden rounded-lg border border-violet-200/15 shadow-2xl shadow-violet-950/30 sm:aspect-[16/10] sm:min-h-0 md:aspect-[21/9]">
                <SpotPhotoImage
                    src={heroImage}
                    fallbackSrc={fallbackImage}
                    alt={spot.name}
                    className="object-cover"
                    priority
                    quality={90}
                    sizes="(max-width: 768px) 100vw, 1024px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />

                <div className="absolute inset-x-0 bottom-0 w-full p-4 sm:p-6 md:p-8">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                        <div className="min-w-0">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <Badge className="border-white/10 bg-white/10 text-white shadow-none hover:bg-white/10">
                                    {spot.category}
                                </Badge>
                                {spot.verified && (
                                    <Badge variant="outline" className="border-emerald-300/40 bg-emerald-400/10 text-emerald-200 backdrop-blur-sm">Verified</Badge>
                                )}
                                <Badge
                                    variant="outline"
                                    className={spot.hasRealPhoto
                                        ? "border-violet-200/30 bg-violet-400/10 text-violet-100 backdrop-blur-sm"
                                        : "border-amber-200/35 bg-amber-400/10 text-amber-100 backdrop-blur-sm"
                                    }
                                >
                                    <ImageIcon className="mr-1 h-3.5 w-3.5" />
                                    {spot.hasRealPhoto ? `${spot.realPhotoCount} spot photo${spot.realPhotoCount === 1 ? "" : "s"}` : "Area image"}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={locationConfidence.tone === "exact"
                                        ? "border-emerald-200/35 bg-emerald-400/10 text-emerald-100 backdrop-blur-sm"
                                        : locationConfidence.tone === "pinned"
                                            ? "border-sky-200/35 bg-sky-400/10 text-sky-100 backdrop-blur-sm"
                                            : "border-amber-200/35 bg-amber-400/10 text-amber-100 backdrop-blur-sm"
                                    }
                                >
                                    {locationConfidence.tone === "area" ? (
                                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                                    ) : (
                                        <MapPin className="mr-1 h-3.5 w-3.5" />
                                    )}
                                    {locationConfidence.label}
                                </Badge>
                            </div>
                            <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">{spot.name}</h1>
                            <div className="mt-3 flex items-start gap-2 text-sm leading-6 text-violet-50/75">
                                <MapPin className="mt-1 h-4 w-4 shrink-0" />
                                <span>{spot.location.address}</span>
                            </div>
                        </div>

                        <SpotInteractions spotId={spot.id} spotName={spot.name} />
                    </div>
                </div>
            </div>

            {galleryImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {galleryImages.map((photo, index) => (
                        <div key={photo} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-violet-200/15 bg-violet-950/40">
                            <SpotPhotoImage
                                src={photo}
                                fallbackSrc={fallbackImage}
                                alt={`${spot.name} photo ${index + 2}`}
                                className="object-cover"
                                quality={90}
                                sizes="(max-width: 768px) 33vw, 320px"
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-8">
                <div className="space-y-5 lg:col-span-2 lg:space-y-8">
                    <div className="flex flex-wrap gap-2">
                        {spot.subcategories.map((sub: string) => (
                            <Badge key={sub} variant="secondary" className="border border-violet-200/15 bg-violet-400/10 px-3 py-1 text-sm text-violet-100">
                                {sub}
                            </Badge>
                        ))}
                    </div>

                    <div className={`${LIQUID_CARD} space-y-4 p-4 sm:p-5`}>
                        <p className="text-base leading-7 text-violet-50/70 sm:text-lg">
                            {spot.description}
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                                <span className="block text-xs text-violet-50/45">Category</span>
                                <span className="mt-1 block truncate text-sm font-semibold text-white">{spot.category}</span>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                                <span className="block text-xs text-violet-50/45">Localley</span>
                                <span className="mt-1 block text-sm font-semibold text-violet-100">{spot.localleyScore}/6</span>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                                <span className="block text-xs text-violet-50/45">Crowd</span>
                                <span className="mt-1 block text-sm font-semibold text-emerald-100">{spot.localPercentage}% local</span>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                                <span className="block text-xs text-violet-50/45">Best time</span>
                                <span className="mt-1 block truncate text-sm font-semibold text-white">{spot.bestTime}</span>
                            </div>
                        </div>
                    </div>

                    <div className={`${LIQUID_CARD} overflow-hidden`}>
                        <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
                            <div className="space-y-4 p-4 sm:p-6">
                                <div>
                                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-violet-200/80">
                                        <Sparkles className="h-4 w-4 text-violet-300" />
                                        Why locals go
                                    </div>
                                    <h2 className="text-2xl font-bold leading-tight text-white">
                                        A verified stop in {primaryArea}
                                    </h2>
                                    <p className="mt-2 text-sm leading-6 text-violet-50/65">
                                        {scoreNarrative}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                                        <Users className="mb-2 h-4 w-4 text-emerald-300" />
                                        <span className="block text-xl font-bold text-white">{spot.localPercentage}%</span>
                                        <span className="text-xs text-violet-50/55">local crowd signal</span>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                                        <Clock className="mb-2 h-4 w-4 text-indigo-300" />
                                        <span className="block truncate text-sm font-semibold text-white">{spot.bestTime}</span>
                                        <span className="text-xs text-violet-50/55">best time to visit</span>
                                    </div>
                                    <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
                                        <Camera className="mb-2 h-4 w-4 text-violet-300" />
                                        <span className="block text-xl font-bold text-white">{spot.realPhotoCount}</span>
                                        <span className="text-xs text-violet-50/55">real spot photo{spot.realPhotoCount === 1 ? "" : "s"}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-white/10 bg-white/[0.035] p-4 sm:p-6 md:border-l md:border-t-0">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-semibold text-white">{locationPlanningCopy.heading}</h3>
                                        <p className="text-xs leading-5 text-violet-50/55">{locationPlanningCopy.description}</p>
                                    </div>
                                    {locationConfidence.tone === "area" ? (
                                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
                                    ) : (
                                        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <div className="flex gap-3 rounded-lg border border-white/10 bg-black/10 p-3">
                                        <Route className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                                        <div>
                                            <p className="text-sm font-medium text-white">{locationPlanningCopy.routeTitle}</p>
                                            <p className="mt-1 text-xs leading-5 text-violet-50/60">{spot.name}, {spot.location.address}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 rounded-lg border border-white/10 bg-black/10 p-3">
                                        <Compass className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                                        <div>
                                            <p className="text-sm font-medium text-white">Build nearby time around {primaryArea}</p>
                                            <p className="mt-1 text-xs leading-5 text-violet-50/60">Save it first, then add cafes, food, markets, or evening stops around the same pocket.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={`${LIQUID_CARD} space-y-5 p-4 sm:p-6`}>
                        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                            <Users className="h-5 w-5 text-violet-300" />
                            Localley Insights
                        </h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-4">
                                <span className="mb-1 block text-sm text-violet-50/55">Crowd Mix</span>
                                <div className="flex items-end gap-2">
                                    <span className="text-2xl font-bold text-violet-200">{spot.localPercentage}%</span>
                                    <span className="mb-1 text-sm font-medium text-violet-50/75">Locals</span>
                                </div>
                                <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                                    <div className="h-1.5 rounded-full bg-violet-400" style={{ width: `${spot.localPercentage}%` }} />
                                </div>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-4">
                                <span className="mb-1 block text-sm text-violet-50/55">Best Time</span>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-5 w-5 text-indigo-300" />
                                    <span className="font-medium">{spot.bestTime}</span>
                                </div>
                            </div>
                        </div>
                        {spot.tips.length > 0 && (
                        <div>
                            <span className="mb-3 block text-sm font-medium uppercase tracking-wider text-violet-50/55">Insider Tips</span>
                            <ul className="space-y-3">
                                {spot.tips.map((tip: string, i: number) => (
                                    <li key={i} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.055] p-3 text-sm text-violet-50/75">
                                        <div className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-400/15 text-xs font-bold text-violet-200">
                                            {i + 1}
                                        </div>
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        )}
                    </div>

                    {/* Viator Activities Section */}
                    <SpotActivities spotId={spot.id} city={city} spotName={spot.name} />

                    {/* Reviews Section */}
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">Reviews</h2>
                        <ReviewList spotId={spot.id} />
                    </div>
                </div>

                <div className="space-y-5">
                    <div className={`space-y-5 p-4 sm:p-6 lg:sticky lg:top-24 ${LIQUID_CARD}`}>
                        <div>
                            <h3 className="mb-4 font-semibold text-white">Localley Score</h3>
                            <div className="flex justify-center py-4">
                                <LocalleyScaleIndicator score={spot.localleyScore} className="scale-125" />
                            </div>
                            <p className="mt-2 px-2 text-center text-sm text-violet-50/60">
                                {spot.localleyScore === LocalleyScale.HIDDEN_GEM
                                    ? "A rare find! Mostly locals and very few tourists know about this spot."
                                    : "A great spot with a mix of people."}
                            </p>
                        </div>

                        <GetDirectionsButton spot={spot} />

                        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.055]">
                            <div className="relative h-36 border-b border-white/10 bg-[#171128]">
                                <div className="absolute inset-0 opacity-35" style={{
                                    backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
                                    backgroundSize: "24px 24px",
                                }} />
                                <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-violet-200/30 bg-violet-500/25 text-violet-100 shadow-lg shadow-violet-950/40 backdrop-blur">
                                        <MapPin className="h-6 w-6" />
                                    </div>
                                    <span className="max-w-[13rem] truncate rounded-full border border-white/10 bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                                        {primaryArea}
                                    </span>
                                </div>
                            </div>
                            <div className="p-4">
                            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                                {locationConfidence.tone === "area" ? (
                                    <AlertTriangle className="h-4 w-4 text-amber-300" />
                                ) : (
                                    <MapPin className="h-4 w-4 text-violet-300" />
                                )}
                                {locationPlanningCopy.locationHeading}
                            </h3>
                            <p className="text-sm leading-6 text-violet-50/70">{spot.location.address}</p>
                            <p className="mt-2 text-xs font-medium text-violet-200/80">
                                Search context: {spot.name}, {city}
                            </p>
                            <p className="mt-2 rounded-md border border-violet-200/15 bg-violet-400/10 p-2 text-xs leading-5 text-violet-50/65">
                                {locationConfidence.description} {getDirectionsHelperText(spot)}
                            </p>
                            {spot.googlePlaceId && !isKoreanLocation(spot.location.address) && (
                                <p className="mt-2 rounded-md border border-emerald-200/20 bg-emerald-400/10 p-2 text-xs leading-5 text-emerald-100/80">
                                    Google place match available. Directions include the matched place ID, not only a text search.
                                </p>
                            )}
                            {formatCoordinate(spot.location.lat) && formatCoordinate(spot.location.lng) && (
                                <p className="mt-2 text-xs text-violet-50/45">
                                    Approximate imported pin: {formatCoordinate(spot.location.lat)}, {formatCoordinate(spot.location.lng)}
                                </p>
                            )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}
