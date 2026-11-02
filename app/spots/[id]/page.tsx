import { notFound } from "next/navigation";
import { communityPublic } from "@/lib/community/access";
import { DriverCardDialog, DriverCardLink } from "@/components/spots/driver-card";
import { SpotEventLink } from "@/components/spots/spot-event-link";
import { headers } from "next/headers";
import { LocalleyScale } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Clock3, Navigation, ArrowLeft, Flame, DollarSign, Utensils, UserRound } from "@/components/ui/icons";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";
import { dataBackend } from "@/lib/app-data/backend";
import { d1CommunitySubmission, d1RelatedSpotSources, d1SpotSource } from "@/lib/spots/d1-queries";
import { directSpotPhotos } from "@/lib/spots/own-photo";
import { SpotInteractions } from "@/components/spots/spot-interactions";
import { SpotActivities } from "@/components/spots/spot-activities";
import { ReviewList } from "@/components/spots/review-list";
import { VenueHeroPhoto, VenuePhotoThumbnails, VenueCardPhoto } from "@/components/spots/spot-photo-image";
import { VenuePhotoProvider } from "@/components/spots/venue-photo-provider";
import { SpotDetailMap } from "@/components/spots/spot-detail-map";
import { SpotJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { normalizeSpotPhotos } from "@/lib/spots/transform";
import { summarizeSpotPhotos } from "@/lib/place-images";
import {
  inferSpotContextCity,
  inferSpotContextCitySlug,
} from "@/lib/spots/city-context";
import { getSpotCoordinateValues } from "@/lib/spots/coordinates";
import {
  buildSpotDirectionsUrl,
  getSpotDirectionsSearchText,
  isKoreanLocation,
} from "@/lib/spots/map-links";
import { countRealDisplaySpotPhotos } from "@/lib/spots/display-images";
import {
  compareRelatedSpotCandidates,
  formatRelatedSpotDistance,
  getSpotDistanceKm,
} from "@/lib/spots/proximity";
import {
  applyPublicSpotVisibilityFilters,
  shouldShowPublicSpot,
} from "@/lib/spots/public-quality";
import {
  getSpotBestTime,
  getTrustedSpotGooglePlaceId,
  normalizeLocalleyScore,
  normalizeLocalPercentage,
  normalizeSpotTips,
} from "@/lib/spots/detail-normalization";
import { mergeSpotSources, normalizeSourceUrls, publicTips, splitDescriptionLinks } from "@/lib/spots/guide";
import { readSpotGuide } from "@/lib/spots/guide-store";
import { fetchSpotViralMentions } from "@/lib/viral/events";
import { formatViralMonth } from "@/lib/viral/feed";
import type { Metadata } from "next";
import { PreviewSaveSpotButton } from "@/components/spots/preview-save-spot-button";
import { previewSavedSpotActor } from "@/lib/app-data/preview-saved-spot-actor";
import { previewSpotPageData } from "@/lib/app-data/preview-spot-page";

const LIQUID_CARD =
  "rounded-lg bg-surface/[0.86] backdrop-blur-xl";

interface RelatedSpot {
  id: string;
  name: string;
  address: string;
  category: string;
  localleyScore: LocalleyScale;
  localPercentage: number;
  distanceKm: number | null;
  distanceLabel: string;
  directPhotos: string[];
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


/** The one directions button on the page (content-first item 1): Kakao Map in Korea, Google Maps elsewhere. */
function GetDirectionsButton({
  spot,
}: {
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>;
}) {
  const directionsUrl = buildSpotDirectionsUrl({
    name: spot.name,
    address: spot.location.address,
    lat: spot.location.lat,
    lng: spot.location.lng,
    googlePlaceId: spot.googlePlaceId,
  });
  const isKorea = isKoreanLocation(spot.location.address);

  return (
    <Button asChild className="h-12 w-full rounded-xl text-base shadow-lg" size="lg">
      <SpotEventLink
        spotId={spot.id}
        event="directions"
        data-testid="spot-directions-link"
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open directions to ${spot.name}`}
      >
        <Navigation className="mr-2 h-5 w-5" />
        {isKorea ? "Directions in Kakao Map" : "Directions in Google Maps"}
      </SpotEventLink>
    </Button>
  );
}

function formatUpdated(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function FactRow({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-raised p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm leading-6 text-foreground">{value}</p>
      </div>
    </div>
  );
}

async function previewSpotPageCandidate(searchParams: Promise<{ data_candidate?: string }>) {
  const [query, requestHeaders] = await Promise.all([searchParams, headers()]);
  return query.data_candidate === "d1"
    && requestHeaders.get("host") === "localley-next-preview.nkopp.workers.dev"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

async function getSpotSourceSupabase(id: string) {
  const supabase = createSupabaseAdmin();

  const { data: spot, error } = await supabase
    .from("spots")
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Could not load spot: ${error.message}`);
  }

  if (!spot) {
    return { spot: null, communitySubmission: null };
  }

  const { data: primaryCommunitySubmission, error: primaryCommunityError } = await supabase
    .from("social_spot_submissions")
    .select("contributor_credit, platform, status, created_at, research_summary, canonical_url, research")
    .eq("spot_id", id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (primaryCommunityError) {
    console.error("[spot-detail] Primary community provenance unavailable:", primaryCommunityError.message);
  }

  let communitySubmission = primaryCommunitySubmission;
  if (!communitySubmission) {
    const { data: candidateCommunitySubmission, error: candidateCommunityError } = await supabase
      .from("social_spot_submissions")
      .select("contributor_credit, platform, status, created_at, research_summary, canonical_url, research")
      .contains("research", { createdCandidates: [{ spotId: id }] })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (candidateCommunityError) {
      console.error("[spot-detail] Candidate community provenance unavailable:", candidateCommunityError.message);
    }

    communitySubmission = candidateCommunitySubmission;
  }

  return { spot, communitySubmission };
}

async function getSpotSourceD1(id: string) {
  const [spot, communitySubmission] = await Promise.all([d1SpotSource(id), d1CommunitySubmission(id)]);
  return { spot, communitySubmission };
}

// Keep the existing Supabase page for all normal preview and www requests.
async function getSpot(id: string, candidate = false) {
  if (candidate) {
    const row = await previewSpotPageData(id);
    if (!row) return null;
    const photos = normalizeSpotPhotos(row.photos, row.category, 1600);
    const photoSummary = summarizeSpotPhotos(photos);
    return {
      id: row.id, name: row.name, description: row.description,
      location: { lat: row.lat ?? 0, lng: row.lng ?? 0, address: row.address },
      category: row.category, subcategories: [] as string[],
      localleyScore: normalizeLocalleyScore(row.score), localPercentage: 50,
      bestTime: "Not verified", photos, hasRealPhoto: photoSummary.hasRealPhoto,
      realPhotoCount: countRealDisplaySpotPhotos(photos), googlePlaceId: null,
      tips: [] as string[], verified: false, trending: false, communitySubmission: null,
      sourceUrls: [] as { title: string; url: string }[], updatedAt: null as string | null,
    };
  }
  const { spot, communitySubmission } = dataBackend() === "d1"
    ? await getSpotSourceD1(id)
    : await getSpotSourceSupabase(id);
  if (!spot) {
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
      google_place_id: spot.google_place_id,
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
  const communityCandidate = communitySubmission && Array.isArray(
    communitySubmission.research?.createdCandidates,
  )
    ? communitySubmission.research.createdCandidates.find(
        (candidate: { spotId?: string | null }) => candidate.spotId === id,
      )
    : null;

  return {
    id: spot.id,
    name: getName(spot.name),
    // Raw multilingual name for the show-to-driver card (local script).
    nameField: spot.name as unknown,
    description: getName(spot.description),
    location: { lat, lng, address },
    category: spot.category || "Local spot",
    subcategories: spot.subcategories || [],
    localleyScore: normalizeLocalleyScore(spot.localley_score),
    localPercentage: normalizeLocalPercentage(spot.local_percentage),
    bestTime: getSpotBestTime(spot.best_times, spot.best_time),
    photos: normalizedPhotos,
    ownPhoto: typeof spot.own_photo === "string" ? spot.own_photo : null,
    hasRealPhoto: photoSummary.hasRealPhoto,
    realPhotoCount: countRealDisplaySpotPhotos(normalizedPhotos),
    googlePlaceId: getTrustedSpotGooglePlaceId({
      photos: normalizedPhotos,
      storedGooglePlaceId: spot.google_place_id,
    }),
    tips: normalizeSpotTips(spot.tips),
    sourceUrls: normalizeSourceUrls(spot.source_urls),
    updatedAt: typeof spot.updated_at === "string" ? spot.updated_at : typeof spot.created_at === "string" ? spot.created_at : null,
    verified: Boolean(spot.verified),
    trending: spot.trending_score > 0.8,
    communitySubmission: communitySubmission
      ? {
          contributorCredit: communitySubmission.contributor_credit as string,
          platform: communitySubmission.platform as string,
          status: (communityCandidate?.status || communitySubmission.status) as string,
          researchSummary: communitySubmission.research_summary as string | null,
          sourceUrl: communitySubmission.canonical_url as string,
        }
      : null,
  };
}

async function getRelatedSpotSourcesSupabase(city: string, excludeId: string, minimumScore: number, limit: number) {
  const supabase = createSupabaseAdmin();

  let relatedQuery = supabase
    .from("spots")
    .select(
      "id, name, address, category, location, localley_score, local_percentage, photos, google_place_id",
    )
    .ilike("address->>en", `%${city}%`)
    .neq("id", excludeId)
    .order("localley_score", { ascending: false })
    .order("local_percentage", { ascending: false })
    .limit(limit);

  relatedQuery = relatedQuery.gte(
    "localley_score",
    minimumScore,
  );
  relatedQuery = applyPublicSpotVisibilityFilters(relatedQuery);

  const { data, error } = await relatedQuery;
  return error || !data ? null : data;
}

async function getRelatedSpots(
  currentSpot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
  city: string,
  limit = 3,
): Promise<RelatedSpot[]> {
  const minimumScore = Math.max(3, currentSpot.localleyScore - 1);
  const data = dataBackend() === "d1"
    ? await d1RelatedSpotSources(city, currentSpot.id, minimumScore, limit * 8).catch(() => null)
    : await getRelatedSpotSourcesSupabase(city, currentSpot.id, minimumScore, limit * 8);
  if (!data) return [];

  return data
    .filter((spot) =>
      shouldShowPublicSpot({
        name: spot.name,
        address: spot.address,
        location: spot.location,
        photos: spot.photos,
        google_place_id: spot.google_place_id,
      }),
    )
    .map((spot) => {
      const name = getName(spot.name);
      const address = getName(spot.address);
      const category = spot.category || "Local spot";
      const { lat, lng } = getSpotCoordinateValues(spot.location);
      const distanceKm = getSpotDistanceKm(
        {
          lat: currentSpot.location.lat,
          lng: currentSpot.location.lng,
          category: currentSpot.category,
          localleyScore: currentSpot.localleyScore,
          localPercentage: currentSpot.localPercentage,
        },
        {
          lat,
          lng,
          category,
          localleyScore: normalizeLocalleyScore(spot.localley_score),
          localPercentage: normalizeLocalPercentage(spot.local_percentage),
        },
      );

      return {
        id: spot.id,
        directPhotos: directSpotPhotos({ ownPhoto: "own_photo" in spot ? spot.own_photo : null, googlePlaceId: spot.google_place_id, photos: normalizeSpotPhotos(spot.photos, category, 900) }),
        name,
        address,
        category,
        localleyScore: normalizeLocalleyScore(spot.localley_score),
        localPercentage: normalizeLocalPercentage(spot.local_percentage),
        distanceKm,
        distanceLabel: formatRelatedSpotDistance(distanceKm),
        lat,
        lng,
      };
    })
    .sort((a, b) =>
      compareRelatedSpotCandidates(
        {
          lat: currentSpot.location.lat,
          lng: currentSpot.location.lng,
          category: currentSpot.category,
          localleyScore: currentSpot.localleyScore,
          localPercentage: currentSpot.localPercentage,
        },
        a,
        b,
      ),
    )
    .slice(0, limit)
    .map((spot) => ({
      id: spot.id,
      name: spot.name,
      address: spot.address,
      category: spot.category,
      localleyScore: spot.localleyScore,
      localPercentage: spot.localPercentage,
      distanceKm: spot.distanceKm,
      distanceLabel: spot.distanceLabel,
      directPhotos: spot.directPhotos,
    }));
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ data_candidate?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const candidate = await previewSpotPageCandidate(searchParams);
  const spot = await getSpot(id, candidate);

  if (!spot) {
    return {
      title: "Spot Not Found - Localley",
      description: "The requested spot could not be found.",
    };
  }

  const scoreLabel = getScoreLabel(spot.localleyScore);
  const title = `${spot.name} - ${scoreLabel} | Localley`;
  const description = `${splitDescriptionLinks(spot.description).text.slice(0, 160)}... Localley Score: ${spot.localleyScore}/6 • ${spot.location.address}`;

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
    ...(candidate ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: spot.name,
      description: `${scoreLabel} - ${spot.description.slice(0, 100)}`,
      type: "website",
      siteName: "Localley",
      images: [],
    },
    twitter: {
      card: "summary",
      title: spot.name,
      description: `${scoreLabel} - ${spot.description.slice(0, 150)}`,
      images: [],
    },
  };
}


export default async function SpotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ data_candidate?: string }>;
}) {
  const { id } = await params;
  const candidate = await previewSpotPageCandidate(searchParams);
  const spot = await getSpot(id, candidate);

  if (!spot) {
    notFound();
  }

  // Use city-level context for related activities; the first address segment is often a district.
  const city = getSpotContextCity(spot);
  const citySlug = inferSpotCitySlug(spot);
  const primaryArea = getPrimaryArea(spot.location.address, city);
  const [relatedSpots, guide, viralMentions] = await Promise.all([
    candidate ? Promise.resolve([] as RelatedSpot[]) : getRelatedSpots(spot, city),
    candidate ? Promise.resolve(null) : readSpotGuide(spot.id),
    candidate ? Promise.resolve([]) : fetchSpotViralMentions(spot.id).catch(() => []),
  ]);
  let saveActor: string | null = null;
  if (candidate) {
    try { saveActor = await previewSavedSpotActor(); }
    catch { /* Candidate owner lookup failures never fall back to source writes. */ }
  }
  const exactMapQuery = getSpotDirectionsSearchText({
    name: spot.name,
    address: spot.location.address,
  });

  // Guidance first (content-first rules 1-2): the stored guide, else the description without its links.
  const description = splitDescriptionLinks(spot.description);
  const bestTime = guide?.bestTime ?? (spot.bestTime && spot.bestTime !== "Not verified" ? spot.bestTime : null);
  const tips = guide?.tips.length ? guide.tips : publicTips(spot.tips).slice(0, 4);
  const sources = mergeSpotSources(
    guide?.sources ?? [],
    description.links,
    viralMentions.flatMap((mention) => mention.sources),
    spot.sourceUrls,
    spot.communitySubmission?.sourceUrl ? [{ title: `${spot.communitySubmission.platform} post`, url: spot.communitySubmission.sourceUrl }] : [],
  );
  const updated = formatUpdated(guide?.updatedAt ?? spot.updatedAt);
  const facts = [
    bestTime ? { icon: Clock, label: "Best time", value: bestTime } : null,
    guide?.price ? { icon: DollarSign, label: "Price", value: guide.price } : null,
    guide?.duration ? { icon: Clock3, label: "How long", value: guide.duration } : null,
  ].filter((fact): fact is { icon: typeof Clock; label: string; value: string } => Boolean(fact));

  return (
    <VenuePhotoProvider key={spot.id} spotId={spot.id} allowFetch={!candidate} directPhotos={directSpotPhotos(spot)}>
      {/* JSON-LD Structured Data */}
      <SpotJsonLd
        name={spot.name}
        description={description.text}
        category={spot.category}
        address={spot.location.address}
        lat={spot.location.lat}
        lng={spot.location.lng}
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

      <div className="mx-auto max-w-5xl space-y-5 pb-4 animate-in fade-in duration-500 md:space-y-6">
        <Link
          href="/spots"
          className="inline-flex min-h-10 items-center rounded-full bg-raised px-3 text-sm text-foreground transition-colors hover:bg-overlay"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to spots
        </Link>

        <VenueHeroPhoto name={spot.name} />

        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{spot.category}</Badge>
              <span className="text-sm text-muted-foreground">{primaryArea}</span>
            </div>
            <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-4xl">{spot.name}</h1>
          </div>
          <div className="shrink-0">
            {!candidate && <SpotInteractions spotId={spot.id} spotName={spot.name} />}
            {candidate && saveActor && <PreviewSaveSpotButton spotId={spot.id} spotName={spot.name} actorId={saveActor} />}
          </div>
        </header>

        {viralMentions.length > 0 && (
          <section data-testid="spot-trending" className={`${LIQUID_CARD} space-y-2 p-4`} aria-label="Why it is trending">
            {viralMentions.map((mention) => (
              <div key={mention.slug} className="flex items-start gap-3">
                <Flame className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm leading-6 text-foreground">
                  <Link href={`/trending/${mention.slug}`} className="font-semibold underline-offset-2 hover:underline">
                    {mention.label}
                  </Link>{" "}
                  <span className="text-muted-foreground">· {formatViralMonth(mention.month)}</span>
                  {mention.note ? <span className="block">{mention.note}</span> : null}
                </p>
              </div>
            ))}
          </section>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
          <div className="space-y-5 lg:col-span-2">
            {(guide?.guide || description.text) && (
              <section data-testid="spot-guide" className={`${LIQUID_CARD} space-y-3 p-4 sm:p-6`}>
                {(guide?.guide || description.text).split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index} className="text-base leading-7 text-foreground">{paragraph}</p>
                ))}
              </section>
            )}

            {guide && guide.orderOrDo.length > 0 && (
              <section className={`${LIQUID_CARD} space-y-3 p-4 sm:p-6`}>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Utensils className="h-5 w-5 text-primary" aria-hidden="true" />
                  What to get
                </h2>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
                  {guide.orderOrDo.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            )}

            {facts.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-3">
                {facts.map((fact) => <FactRow key={fact.label} {...fact} />)}
              </div>
            )}

            {tips.length > 0 && (
              <section className={`${LIQUID_CARD} space-y-3 p-4 sm:p-6`}>
                <h2 className="text-lg font-semibold text-foreground">Tips</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">
                  {tips.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
              </section>
            )}
          </div>

          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <GetDirectionsButton spot={spot} />
            <DriverCardLink spotId={spot.id} />
            <div className={`${LIQUID_CARD} overflow-hidden`}>
              <SpotDetailMap lat={spot.location.lat} lng={spot.location.lng} name={spot.name} category={spot.category} photos={spot.photos}
                searchUrl={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exactMapQuery)}`} />
              <p className="flex items-start gap-2 p-3 text-sm leading-6 text-foreground">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span data-testid="spot-detail-address">{spot.location.address}</span>
              </p>
            </div>
          </aside>
        </div>

        <VenuePhotoThumbnails name={spot.name} />

        {!candidate && <SpotActivities spotId={spot.id} city={city} spotName={spot.name} />}

        {relatedSpots.length > 0 && (
          <section className="space-y-3" aria-label="Nearby">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-xl font-bold text-foreground">Nearby</h2>
              {citySlug ? (
                <Link href={`/spots?city=${encodeURIComponent(citySlug)}`} className="text-sm font-semibold text-foreground hover:underline">
                  More in {city}
                </Link>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {relatedSpots.map((related) => (
                <div key={related.id} className="group relative overflow-hidden rounded-lg bg-raised transition-all duration-300 hover:-translate-y-0.5">
                  <VenueCardPhoto spotId={related.id} name={related.name} directPhotos={related.directPhotos} frameClassName="aspect-[4/3] w-full" />
                  <div className="space-y-1 p-3">
                    <h3 className="line-clamp-1 font-semibold text-foreground">
                      <Link href={`/spots/${related.id}`} className="after:absolute after:inset-0 after:z-[1] focus-visible:outline focus-visible:outline-2">{related.name}</Link>
                    </h3>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {related.category} · {related.distanceLabel}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Reviews</h2>
            {!candidate && communityPublic() && (
              <Link
                href={`/spots/${spot.id}/tips`}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary/10 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/15"
              >
                Traveller tips and photos
              </Link>
            )}
          </div>
          <ReviewList spotId={spot.id} />
        </section>

        <footer data-testid="spot-sources" className="mt-2 space-y-1 pt-6 text-xs leading-5 text-muted-foreground">
          {spot.communitySubmission && (
            <p className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              {spot.communitySubmission.status === "spot_reused" ? "Matched" : "Shared"} by {spot.communitySubmission.contributorCredit}
            </p>
          )}
          {sources.length > 0 && (
            <p>
              Sources:{" "}
              {sources.map((source, index) => (
                <span key={source.url}>
                  {index > 0 ? " · " : null}
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{source.title}</a>
                </span>
              ))}
            </p>
          )}
          {updated && <p>Last updated {updated}</p>}
        </footer>
      </div>
      <DriverCardDialog spotId={spot.id} name={spot.name} nameField={spot.nameField} address={spot.location.address} />
    </VenuePhotoProvider>
  );
}
