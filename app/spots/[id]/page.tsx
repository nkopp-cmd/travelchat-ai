import { notFound } from "next/navigation";
import { LocalleyScale } from "@/types";
import { LocalleyScaleIndicator } from "@/components/spots/localley-scale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ImageIcon,
  MapPin,
  Clock,
  Users,
  Navigation,
  ArrowLeft,
  Camera,
  Compass,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";
import { SpotInteractions } from "@/components/spots/spot-interactions";
import { SpotActivities } from "@/components/spots/spot-activities";
import { ReviewList } from "@/components/spots/review-list";
import { SpotPhotoImage } from "@/components/spots/spot-photo-image";
import { SpotJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { normalizeSpotPhotos } from "@/lib/spots/transform";
import {
  addFallbackToPlacePhotoUrl,
  getGooglePlaceIdFromSpotPhotos,
  summarizeSpotPhotos,
} from "@/lib/place-images";
import {
  inferSpotContextCity,
  inferSpotContextCitySlug,
} from "@/lib/spots/city-context";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";
import { getSpotCoordinateValues } from "@/lib/spots/coordinates";
import {
  buildSpotDirectionsUrl,
  getSpotDirectionsSearchText,
  isKoreanLocation,
} from "@/lib/spots/map-links";
import { getSpotFallbackImageUrl } from "@/lib/spots/spot-fallback-images";
import {
  applyPublicSpotVisibilityFilters,
  shouldShowPublicSpot,
} from "@/lib/spots/public-quality";
import {
  getSpotBestTime,
  getSpotCoordinateEvidenceLabel,
  getSpotDirectionsButtonLabel,
  getSpotPhotoEvidenceHelper,
  getSpotPhotoEvidenceLabel,
  normalizeLocalleyScore,
  normalizeLocalPercentage,
  normalizeSpotTips,
} from "@/lib/spots/detail-normalization";
import type { Metadata } from "next";

const LIQUID_CARD =
  "rounded-lg border border-violet-200/15 bg-[#100b1c]/86 shadow-lg shadow-violet-950/20 backdrop-blur-xl";

interface RelatedSpot {
  id: string;
  name: string;
  address: string;
  category: string;
  localleyScore: LocalleyScale;
  localPercentage: number;
  photo: string;
  fallbackImage: string;
  hasRealPhoto: boolean;
  realPhotoCount: number;
}

// Helper to parse multi-language fields
function getName(
  field: string | Record<string, string> | null | undefined,
): string {
  if (typeof field === "object" && field !== null) {
    return field.en || Object.values(field)[0] || "";
  }
  return field || "";
}

function getDirectionsHelperText(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
): string {
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
      ? "Kakao opens a name and area search because this source record does not have an exact address yet."
      : "Maps opens a name and area search because this source record does not have an exact address yet.";
  }

  if (isKorea && locationConfidence.usableCoordinates) {
    return "Kakao opens the stored map pin as the route target, with the spot name as the destination label.";
  }

  return isKorea
    ? "Kakao searches the spot name and stored address because this record does not have a usable saved pin yet."
    : "Maps searches the spot name and stored address first, so the imported pin is only supporting context.";
}

function getLocationPlanningCopy(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
) {
  const confidence = getLocationConfidence(spot);

  if (spot.googlePlaceId && confidence.tone === "exact") {
    return {
      heading: "Plan this exact stop",
      description:
        "Matched place data gives this spot a reliable navigation target.",
      routeTitle: "Navigate with place match",
      locationHeading: "Exact location",
    };
  }

  if (confidence.tone === "exact") {
    return {
      heading: "Plan this exact stop",
      description:
        "The stored address is specific enough for maps to search directly.",
      routeTitle: "Navigate by name and address",
      locationHeading: "Exact location",
    };
  }

  if (confidence.tone === "pinned") {
    return {
      heading: "Plan this pinned area",
      description:
        "This is area-level source data with a saved map pin. Directions route to the saved coordinate, with the spot name as context.",
      routeTitle: "Route to saved pin",
      locationHeading: "Pinned area",
    };
  }

  return {
    heading: "Plan this area carefully",
    description:
      "This record still needs exact address enrichment. Use the map result as a search starting point.",
    routeTitle: "Search by name and area",
    locationHeading: "Area-level location",
  };
}

function getSpotContextCity(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
): string {
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
  return (
    !src ||
    src.startsWith("/images/placeholders/") ||
    src === "/placeholder-spot.svg" ||
    src.includes("placeholder")
  );
}

function inferSpotCity(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
): string | null {
  return inferSpotContextCity({
    name: spot.name,
    address: spot.location.address,
    lat: spot.location.lat,
    lng: spot.location.lng,
  });
}

function inferSpotCitySlug(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
): string | null {
  return inferSpotContextCitySlug({
    name: spot.name,
    address: spot.location.address,
    lat: spot.location.lat,
    lng: spot.location.lng,
  });
}

function getSpotHeroImage(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
) {
  const photos = spot.photos as string[];
  const realPhoto = photos.find((photo: string) => !isPlaceholderImage(photo));
  if (realPhoto) return realPhoto;

  const city = inferSpotCity(spot);
  if (!city) return "/placeholder-spot.svg";

  return getSpotFallbackImageUrl({
    name: spot.name,
    category: spot.category,
    city,
    address: spot.location.address,
    width: 1600,
    height: 900,
    quality: 90,
  });
}

function getSpotFallbackImage(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
) {
  const city = inferSpotCity(spot);
  if (!city) return "/placeholder-spot.svg";

  return getSpotFallbackImageUrl({
    name: spot.name,
    category: spot.category,
    city,
    address: spot.location.address,
    width: 1600,
    height: 900,
    quality: 90,
  });
}

function getSpotGalleryImages(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
) {
  const photos = (spot.photos as string[]).filter(
    (photo: string) => !isPlaceholderImage(photo),
  );
  return photos.length > 1 ? photos.slice(1, 4) : [];
}

function getDisplaySpotImage(src: string, fallbackImage: string) {
  return addFallbackToPlacePhotoUrl(src, fallbackImage);
}

function getLocationConfidence(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
) {
  return getSpotLocationConfidence({
    address: spot.location.address,
    lat: spot.location.lat,
    lng: spot.location.lng,
  });
}

function getScoreNarrative(score: LocalleyScale): string {
  if (score >= LocalleyScale.LEGENDARY_ALLEY)
    return "Almost entirely local energy with a strong reason to build a day around it.";
  if (score >= LocalleyScale.HIDDEN_GEM)
    return "A rare local-first find that still feels tucked away from the obvious routes.";
  if (score >= LocalleyScale.LOCAL_FAVORITE)
    return "A dependable neighborhood favorite with enough local signal to be worth a detour.";
  return "A useful stop with a mixed crowd and clear practical value for a nearby route.";
}

function getDirectionsTargetLabel(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
): string {
  const confidence = getLocationConfidence(spot);
  const isKorea = isKoreanLocation(spot.location.address);

  if (isKorea && confidence.usableCoordinates) return "Directions target";
  if (!isKorea && spot.googlePlaceId) return "Matched place";
  return confidence.tone === "area" ? "Maps will search" : "Directions search";
}

function getDirectionsTargetValue(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
  fallbackQuery: string,
): string {
  const confidence = getLocationConfidence(spot);
  const lat = formatCoordinate(spot.location.lat);
  const lng = formatCoordinate(spot.location.lng);

  if (
    isKoreanLocation(spot.location.address) &&
    confidence.usableCoordinates &&
    lat &&
    lng
  ) {
    return `${spot.name} (${lat}, ${lng})`;
  }

  return fallbackQuery;
}

function getPrimaryArea(address: string, city: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const district = parts.find(
    (part) =>
      /\b(gu|ku|dong|machi|cho|ward|district|neighborhood|neighbourhood|bukit|soi|road|street|lane)\b/i.test(
        part,
      ) || /[가-힣]+(구|동|로|길)$/.test(part),
  );

  if (district && !/^\d/.test(district)) return district;

  const namedArea = parts.find(
    (part) => part.toLowerCase() !== city.toLowerCase() && !/^\d/.test(part),
  );

  return namedArea || city;
}

function getLocationToneClasses(
  tone: ReturnType<typeof getLocationConfidence>["tone"],
) {
  if (tone === "exact")
    return "border-emerald-200/20 bg-emerald-400/10 text-emerald-100";
  if (tone === "pinned") return "border-sky-200/20 bg-sky-400/10 text-sky-100";
  return "border-amber-200/25 bg-amber-400/10 text-amber-100";
}

function DetailSignal({
  icon: Icon,
  label,
  value,
  helper,
  tone = "violet",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper?: string;
  tone?: "violet" | "emerald" | "sky" | "amber";
}) {
  const toneClasses = {
    violet: "border-violet-200/15 bg-violet-400/10 text-violet-100",
    emerald: "border-emerald-200/15 bg-emerald-400/10 text-emerald-100",
    sky: "border-sky-200/15 bg-sky-400/10 text-sky-100",
    amber: "border-amber-200/20 bg-amber-400/10 text-amber-100",
  }[tone];

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.055] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-50/45">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${toneClasses}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {label}
      </div>
      <p className="text-sm font-semibold leading-snug text-white">{value}</p>
      {helper && (
        <p className="mt-1 text-xs leading-5 text-violet-50/55">{helper}</p>
      )}
    </div>
  );
}

// Get Directions button component
function GetDirectionsButton({
  spot,
  compact = false,
}: {
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>;
  compact?: boolean;
}) {
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
      aria-label={`Open directions to ${spot.name}`}
    >
      <Button
        className={`w-full bg-violet-600 shadow-lg shadow-violet-500/20 hover:bg-violet-700 ${compact ? "h-11 rounded-lg text-sm" : "h-12 rounded-xl text-lg"}`}
        size="lg"
      >
        <Navigation className={compact ? "mr-2 h-4 w-4" : "mr-2 h-5 w-5"} />
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

  if (
    !shouldShowPublicSpot({
      name: spot.name,
      address: spot.address,
      location: spot.location,
      photos: spot.photos,
    })
  ) {
    return null;
  }

  const normalizedPhotos = normalizeSpotPhotos(
    spot.photos,
    spot.category,
    1600,
  );
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
      0,
    ),
    googlePlaceId:
      spot.google_place_id || getGooglePlaceIdFromSpotPhotos(normalizedPhotos),
    tips: normalizeSpotTips(spot.tips),
    verified: Boolean(spot.verified),
    trending: spot.trending_score > 0.8,
  };
}

async function getRelatedSpots(
  currentSpot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
  city: string,
  limit = 3,
): Promise<RelatedSpot[]> {
  const supabase = createSupabaseAdmin();

  let relatedQuery = supabase
    .from("spots")
    .select(
      "id, name, address, category, location, localley_score, local_percentage, photos",
    )
    .ilike("address->>en", `%${city}%`)
    .neq("id", currentSpot.id)
    .order("localley_score", { ascending: false })
    .order("local_percentage", { ascending: false })
    .limit(limit * 2);

  relatedQuery = relatedQuery.gte(
    "localley_score",
    Math.max(3, currentSpot.localleyScore - 1),
  );
  relatedQuery = applyPublicSpotVisibilityFilters(relatedQuery);

  const { data, error } = await relatedQuery;
  if (error || !data) return [];

  return data
    .filter((spot) =>
      shouldShowPublicSpot({
        name: spot.name,
        address: spot.address,
        location: spot.location,
        photos: spot.photos,
      }),
    )
    .slice(0, limit)
    .map((spot) => {
      const name = getName(spot.name);
      const address = getName(spot.address);
      const category = spot.category || "Local spot";
      const normalizedPhotos = normalizeSpotPhotos(spot.photos, category, 900);
      const photoSummary = summarizeSpotPhotos(normalizedPhotos);
      const cityContext =
        inferSpotContextCity({
          name,
          address,
          lat: 0,
          lng: 0,
        }) || city;
      const fallbackImage = getSpotFallbackImageUrl({
        name,
        category,
        city: cityContext,
        address,
        width: 900,
        height: 675,
        quality: 90,
      });
      const realPhoto = normalizedPhotos.find(
        (photo) => !isPlaceholderImage(photo),
      );

      return {
        id: spot.id,
        name,
        address,
        category,
        localleyScore: normalizeLocalleyScore(spot.localley_score),
        localPercentage: normalizeLocalPercentage(spot.local_percentage),
        photo: addFallbackToPlacePhotoUrl(
          realPhoto || fallbackImage,
          fallbackImage,
        ),
        fallbackImage,
        hasRealPhoto: photoSummary.hasRealPhoto,
        realPhotoCount: Object.entries(photoSummary.kinds).reduce(
          (count, [kind, value]) =>
            kind === "proxy" ||
            kind === "remote_https" ||
            kind === "local_asset"
              ? count + value
              : count,
          0,
        ),
      };
    });
}

// Get score label for metadata
function getScoreLabel(score: LocalleyScale): string {
  if (score >= 6) return "Legendary Local Spot";
  if (score >= 5) return "Hidden Gem";
  if (score >= 4) return "Local Favorite";
  return "Popular Spot";
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const spot = await getSpot(id);

  if (!spot) {
    return {
      title: "Spot Not Found - Localley",
      description: "The requested spot could not be found.",
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
    spot.location.address.split(",")[0].trim(),
    "local spots",
    "hidden gems",
    "travel guide",
  ].join(", ");

  return {
    title,
    description,
    keywords,
    openGraph: {
      title: spot.name,
      description: `${scoreLabel} - ${spot.description.slice(0, 100)}`,
      type: "website",
      siteName: "Localley",
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
      card: "summary_large_image",
      title: spot.name,
      description: `${scoreLabel} - ${spot.description.slice(0, 150)}`,
      images: [imageUrl],
    },
  };
}

export default async function SpotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const spot = await getSpot(id);

  if (!spot) {
    notFound();
  }

  // Use city-level context for related activities; the first address segment is often a district.
  const city = getSpotContextCity(spot);
  const citySlug = inferSpotCitySlug(spot);
  const heroImage = getSpotHeroImage(spot);
  const fallbackImage = getSpotFallbackImage(spot);
  const galleryImages = getSpotGalleryImages(spot);
  const locationConfidence = getLocationConfidence(spot);
  const primaryArea = getPrimaryArea(spot.location.address, city);
  const scoreNarrative = getScoreNarrative(spot.localleyScore);
  const locationPlanningCopy = getLocationPlanningCopy(spot);
  const locationSignalTone =
    locationConfidence.tone === "exact"
      ? "emerald"
      : locationConfidence.tone === "pinned"
        ? "sky"
        : "amber";
  const relatedSpots = await getRelatedSpots(spot, city);
  const exactMapQuery = getSpotDirectionsSearchText({
    name: spot.name,
    address: spot.location.address,
  });

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
        <Link
          href="/spots"
          className="inline-flex min-h-10 items-center rounded-full border border-violet-200/15 bg-white/[0.055] px-3 text-sm text-violet-50/70 transition-colors hover:bg-violet-400/10 hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to spots
        </Link>

        <div className="relative aspect-[4/3] min-h-60 w-full overflow-hidden rounded-lg border border-violet-200/15 shadow-2xl shadow-violet-950/30 sm:aspect-[16/10] sm:min-h-0 md:aspect-[21/9]">
          <SpotPhotoImage
            src={getDisplaySpotImage(heroImage, fallbackImage)}
            fallbackSrc={fallbackImage}
            alt={spot.name}
            className="object-cover"
            priority
            quality={90}
            sizes="(max-width: 768px) 100vw, 1024px"
            fallbackBadgeLabel="Image fallback"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
          <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4">
            <SpotInteractions spotId={spot.id} spotName={spot.name} />
          </div>

          <div className="absolute inset-x-0 bottom-0 w-full p-4 sm:p-6 md:p-8">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 sm:mb-3">
                <Badge className="border-white/10 bg-white/10 text-white shadow-none hover:bg-white/10">
                  {spot.category}
                </Badge>
                {spot.verified && (
                  <Badge
                    variant="outline"
                    className="border-emerald-300/40 bg-emerald-400/10 text-emerald-200 backdrop-blur-sm"
                  >
                    Verified
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={
                    spot.hasRealPhoto
                      ? "border-violet-200/30 bg-violet-400/10 text-violet-100 backdrop-blur-sm"
                      : "border-amber-200/35 bg-amber-400/10 text-amber-100 backdrop-blur-sm"
                  }
                >
                  <ImageIcon className="mr-1 h-3.5 w-3.5" />
                  {getSpotPhotoEvidenceLabel(spot)}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    locationConfidence.tone === "exact"
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
              <h1 className="hidden text-4xl font-bold leading-tight text-white sm:block">
                {spot.name}
              </h1>
              <div className="mt-3 hidden items-start gap-2 text-sm leading-6 text-violet-50/75 sm:flex">
                <MapPin className="mt-1 h-4 w-4 shrink-0" />
                <span>{spot.location.address}</span>
              </div>
            </div>
          </div>
        </div>

        <section
          className={`${LIQUID_CARD} space-y-2 p-3 sm:hidden`}
          aria-label="Spot summary"
        >
          <h1 className="text-2xl font-bold leading-tight text-white">
            {spot.name}
          </h1>
          <div className="flex items-start gap-2 text-sm leading-6 text-violet-50/70">
            <MapPin className="mt-1 h-4 w-4 shrink-0 text-violet-300" />
            <span>{spot.location.address}</span>
          </div>
        </section>

        <section
          className={`${LIQUID_CARD} space-y-3 p-3 lg:hidden`}
          aria-label="Spot planning actions"
        >
          <GetDirectionsButton spot={spot} compact />
          <p className="text-xs leading-5 text-violet-50/60">
            {getDirectionsHelperText(spot)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <MapPin className="h-3.5 w-3.5 text-violet-300" />
                {locationConfidence.label}
              </span>
              <span className="mt-1 block truncate text-xs text-violet-50/50">
                {primaryArea}
              </span>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.055] p-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Clock className="h-3.5 w-3.5 text-indigo-300" />
                Best time
              </span>
              <span className="mt-1 block truncate text-xs text-violet-50/50">
                {spot.bestTime}
              </span>
            </div>
          </div>
        </section>

        {galleryImages.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {galleryImages.map((photo, index) => (
              <div
                key={photo}
                className="relative aspect-[4/3] overflow-hidden rounded-lg border border-violet-200/15 bg-violet-950/40"
              >
                <SpotPhotoImage
                  src={getDisplaySpotImage(photo, fallbackImage)}
                  fallbackSrc={fallbackImage}
                  alt={`${spot.name} photo ${index + 2}`}
                  className="object-cover"
                  quality={90}
                  sizes="(max-width: 768px) 33vw, 320px"
                  fallbackBadgeLabel="Fallback"
                  fallbackBadgeClassName="absolute bottom-1.5 left-1.5 z-10 rounded-full border border-amber-200/30 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100 shadow-lg shadow-black/15 backdrop-blur"
                />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-8">
          <div className="space-y-5 lg:col-span-2 lg:space-y-8">
            <div className="flex flex-wrap gap-2">
              {spot.subcategories.map((sub: string) => (
                <Badge
                  key={sub}
                  variant="secondary"
                  className="border border-violet-200/15 bg-violet-400/10 px-3 py-1 text-sm text-violet-100"
                >
                  {sub}
                </Badge>
              ))}
            </div>

            <div className={`${LIQUID_CARD} space-y-4 p-4 sm:p-5`}>
              <p className="text-base leading-7 text-violet-50/70 sm:text-lg">
                {spot.description}
              </p>
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
                      {spot.verified ? "A verified stop" : "A local-first stop"}{" "}
                      in {primaryArea}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-violet-50/65">
                      {scoreNarrative}
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <DetailSignal
                      icon={Sparkles}
                      label="Localley score"
                      value={`${spot.localleyScore}/6`}
                      helper="Higher means stronger local signal and lower tourist-default energy."
                    />
                    <DetailSignal
                      icon={Users}
                      label="Crowd signal"
                      value={`${spot.localPercentage}% local`}
                      helper="Estimated from Localley scoring inputs and curation signals."
                      tone="emerald"
                    />
                    <DetailSignal
                      icon={Clock}
                      label="Best window"
                      value={spot.bestTime}
                      helper="Use this to anchor the stop inside a realistic day route."
                      tone="sky"
                    />
                    <DetailSignal
                      icon={Camera}
                      label="Photo proof"
                      value={getSpotPhotoEvidenceLabel(spot)}
                      helper={getSpotPhotoEvidenceHelper(spot)}
                      tone={spot.hasRealPhoto ? "violet" : "amber"}
                    />
                  </div>
                </div>

                <div className="border-t border-white/10 bg-white/[0.035] p-4 sm:p-6 md:border-l md:border-t-0">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white">
                        {locationPlanningCopy.heading}
                      </h3>
                      <p className="text-xs leading-5 text-violet-50/55">
                        {locationPlanningCopy.description}
                      </p>
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
                        <p className="text-sm font-medium text-white">
                          {locationPlanningCopy.routeTitle}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-violet-50/60">
                          {spot.name}, {spot.location.address}
                        </p>
                        <p
                          className={`mt-2 inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${getLocationToneClasses(locationConfidence.tone)}`}
                        >
                          {locationConfidence.label}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 rounded-lg border border-white/10 bg-black/10 p-3">
                      <Compass className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                      <div>
                        <p className="text-sm font-medium text-white">
                          Build nearby time around {primaryArea}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-violet-50/60">
                          Save it first, then add cafes, food, markets, or
                          evening stops around the same pocket.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {spot.tips.length > 0 && (
              <div className={`${LIQUID_CARD} space-y-4 p-4 sm:p-6`}>
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
                    <Users className="h-5 w-5 text-violet-300" />
                    Before you go
                  </h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {spot.tips.map((tip: string, i: number) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.055] p-3 text-sm leading-6 text-violet-50/75"
                      >
                        <div className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-400/15 text-xs font-bold text-violet-200">
                          {i + 1}
                        </div>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Viator Activities Section */}
            <SpotActivities spotId={spot.id} city={city} spotName={spot.name} />

            {/* Reviews Section */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Reviews</h2>
              <ReviewList spotId={spot.id} />
            </div>
          </div>

          <div className="space-y-5">
            <div
              className={`space-y-5 p-4 sm:p-6 lg:sticky lg:top-24 ${LIQUID_CARD}`}
            >
              <div>
                <h3 className="mb-4 font-semibold text-white">
                  Localley Score
                </h3>
                <div className="flex justify-center py-4">
                  <LocalleyScaleIndicator
                    score={spot.localleyScore}
                    className="scale-125"
                  />
                </div>
                <p className="mt-2 px-2 text-center text-sm text-violet-50/60">
                  {spot.localleyScore === LocalleyScale.HIDDEN_GEM
                    ? "A rare find! Mostly locals and very few tourists know about this spot."
                    : "A great spot with a mix of people."}
                </p>
              </div>

              <div className="hidden lg:block">
                <GetDirectionsButton spot={spot} />
              </div>

              <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.055]">
                <div className="relative h-36 border-b border-white/10 bg-[#171128]">
                  <div
                    className="absolute inset-0 opacity-35"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
                      backgroundSize: "24px 24px",
                    }}
                  />
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
                  <p className="text-sm leading-6 text-violet-50/70">
                    {spot.location.address}
                  </p>
                  <p className="mt-2 text-xs font-medium text-violet-200/80">
                    {getDirectionsTargetLabel(spot)}:{" "}
                    {getDirectionsTargetValue(
                      spot,
                      exactMapQuery || `${spot.name}, ${city}`,
                    )}
                  </p>
                  <div className="mt-3 grid gap-2">
                    <DetailSignal
                      icon={MapPin}
                      label="Area"
                      value={primaryArea}
                      helper={`Shown inside ${city} context.`}
                      tone={locationSignalTone}
                    />
                    <DetailSignal
                      icon={Route}
                      label="Route precision"
                      value={locationConfidence.label}
                      helper={
                        spot.googlePlaceId &&
                        !isKoreanLocation(spot.location.address)
                          ? "Uses a Google Place match where supported."
                          : locationConfidence.description
                      }
                      tone={locationSignalTone}
                    />
                  </div>
                  <p className="mt-2 rounded-md border border-violet-200/15 bg-violet-400/10 p-2 text-xs leading-5 text-violet-50/65">
                    {locationConfidence.description}{" "}
                    {getDirectionsHelperText(spot)}
                  </p>
                  {spot.googlePlaceId &&
                    !isKoreanLocation(spot.location.address) && (
                      <p className="mt-2 rounded-md border border-emerald-200/20 bg-emerald-400/10 p-2 text-xs leading-5 text-emerald-100/80">
                        Google place match available. Directions include the
                        matched place ID, not only a text search.
                      </p>
                    )}
                  {formatCoordinate(spot.location.lat) &&
                    formatCoordinate(spot.location.lng) && (
                      <p className="mt-2 text-xs text-violet-50/45">
                        {getSpotCoordinateEvidenceLabel({
                          address: spot.location.address,
                          tone: locationConfidence.tone,
                          usableCoordinates: locationConfidence.usableCoordinates,
                        })}
                        :{" "}
                        {formatCoordinate(spot.location.lat)},{" "}
                        {formatCoordinate(spot.location.lng)}
                      </p>
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {relatedSpots.length > 0 && (
          <section className={`${LIQUID_CARD} p-4 sm:p-6`}>
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-violet-200/70">
                  Nearby picks
                </p>
                <h2 className="text-2xl font-bold leading-tight text-white">
                  Build the same pocket into a route
                </h2>
              </div>
              {citySlug ? (
                <Link
                  href={`/spots?city=${encodeURIComponent(citySlug)}`}
                  className="text-sm font-semibold text-violet-200 transition-colors hover:text-white"
                >
                  More in {city}
                </Link>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {relatedSpots.map((related) => (
                <Link
                  key={related.id}
                  href={`/spots/${related.id}`}
                  className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-white/[0.075]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-violet-950/50">
                    <SpotPhotoImage
                      src={related.photo}
                      fallbackSrc={related.fallbackImage}
                      alt={related.name}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      quality={90}
                      sizes="(max-width: 768px) 100vw, 320px"
                      fallbackBadgeLabel="Fallback"
                      fallbackBadgeClassName="absolute bottom-2 left-2 z-10 rounded-full border border-amber-200/30 bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-amber-100 shadow-lg shadow-black/15 backdrop-blur"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                    <span className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
                      {related.category}
                    </span>
                    <span className="absolute bottom-2 right-2 rounded-full border border-violet-200/25 bg-violet-500/85 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
                      {related.localleyScore}/6
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <div>
                      <h3 className="line-clamp-1 font-semibold text-white group-hover:text-violet-100">
                        {related.name}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-xs text-violet-50/55">
                        {related.address}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                      <span className="rounded-md border border-emerald-200/20 bg-emerald-400/10 px-2 py-1 text-emerald-100">
                        {related.localPercentage}% local
                      </span>
                      <span
                        className={
                          related.hasRealPhoto
                            ? "rounded-md border border-violet-200/20 bg-violet-400/10 px-2 py-1 text-violet-100"
                            : "rounded-md border border-amber-200/25 bg-amber-400/10 px-2 py-1 text-amber-100"
                        }
                      >
                        {related.hasRealPhoto
                          ? `${related.realPhotoCount} photo${related.realPhotoCount === 1 ? "" : "s"}`
                          : "Area image"}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
