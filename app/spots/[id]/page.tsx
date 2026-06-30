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
import { SpotJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { getCityImageUrl } from "@/lib/city-images";
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

// Helper to determine if location is in Korea
function isKoreanLocation(address: string): boolean {
    const koreanIndicators = [
        "Korea", "Seoul", "Busan", "Incheon", "Daegu", "Daejeon",
        "Gwangju", "Ulsan", "Gyeonggi", "Gangwon", "Jeju",
        "대한민국", "서울", "부산", "인천", "대구", "대전", "광주", "울산", "제주"
    ];
    return koreanIndicators.some(indicator =>
        address.toLowerCase().includes(indicator.toLowerCase())
    );
}

// Helper to build directions URL (Kakao Maps for Korea, Google Maps for others)
function getDirectionsUrl(
    name: string,
    lat: number,
    lng: number,
    address: string
): string {
    const hasValidCoords = lat !== 0 && lng !== 0;
    const isKorea = isKoreanLocation(address);

    if (isKorea) {
        // Kakao Maps - better coverage in Korea
        return hasValidCoords
            ? `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`
            : `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;
    } else {
        // Google Maps - better for rest of the world
        return hasValidCoords
            ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
            : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    }
}

function isPlaceholderImage(src: string | undefined) {
    return !src || src.startsWith("/") || src.includes("placeholder");
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

// Get Directions button component
function GetDirectionsButton({ spot }: { spot: NonNullable<Awaited<ReturnType<typeof getSpot>>> }) {
    const directionsUrl = getDirectionsUrl(
        spot.name,
        spot.location.lat,
        spot.location.lng,
        spot.location.address
    );
    const isKorea = isKoreanLocation(spot.location.address);

    return (
        <Link
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full"
        >
            <Button className="w-full h-12 text-lg bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-500/20 rounded-xl" size="lg">
                <Navigation className="mr-2 h-5 w-5" />
                {isKorea ? "Open in Kakao Maps" : "Get Directions"}
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

    // Parse location coordinates
    const lat = spot.location?.coordinates?.[1] || 0;
    const lng = spot.location?.coordinates?.[0] || 0;
    const address = getName(spot.address);

    return {
        id: spot.id,
        name: getName(spot.name),
        description: getName(spot.description),
        location: { lat, lng, address },
        category: spot.category || "Local spot",
        subcategories: spot.subcategories || [],
        localleyScore: spot.localley_score as LocalleyScale,
        localPercentage: spot.local_percentage,
        bestTime: spot.best_times?.en || "Anytime",
        photos: spot.photos || ["/placeholder-spot.svg"],
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

    // Extract city from address for Viator activities
    const city = spot.location.address.split(',')[0].trim();
    const heroImage = getSpotHeroImage(spot);

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

            <div className="relative min-h-[430px] w-full overflow-hidden rounded-lg border border-violet-200/15 shadow-2xl shadow-violet-950/30 md:aspect-[21/9] md:min-h-0">
                <Image
                    src={heroImage}
                    alt={spot.name}
                    fill
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

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-8">
                <div className="space-y-5 lg:col-span-2 lg:space-y-8">
                    <div className="flex flex-wrap gap-2">
                        {spot.subcategories.map((sub: string) => (
                            <Badge key={sub} variant="secondary" className="border border-violet-200/15 bg-violet-400/10 px-3 py-1 text-sm text-violet-100">
                                {sub}
                            </Badge>
                        ))}
                    </div>

                    <div className={`${LIQUID_CARD} p-4 sm:p-5`}>
                        <p className="text-base leading-7 text-violet-50/70 sm:text-lg">
                            {spot.description}
                        </p>
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
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}
