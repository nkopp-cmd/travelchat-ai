import { notFound } from "next/navigation";
import { DriverCardLink } from "@/components/spots/driver-card";
import { SpotEventLink } from "@/components/spots/spot-event-link";
import { headers } from "next/headers";
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
  UserRound,
  ExternalLink,
} from "@/components/ui/icons";
import type { LucideIcon } from "@/components/ui/icons";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";
import { dataBackend } from "@/lib/app-data/backend";
import { d1CommunitySubmission, d1RelatedSpotSources, d1SpotSource } from "@/lib/spots/d1-queries";
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
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";
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
  getSpotCoordinateEvidenceLabel,
  getSpotDirectionsButtonLabel,
  getSpotNavigationMode,
  getSpotNavigationSignalTone,
  getSpotNavigationTargetValue,
  getSpotPhotoEvidenceHelper,
  getSpotPhotoEvidenceLabel,
  getSpotRecordConfidence,
  getSpotVisitPlan,
  getTrustedSpotGooglePlaceId,
  normalizeLocalleyScore,
  normalizeLocalPercentage,
  normalizeSpotTips,
} from "@/lib/spots/detail-normalization";
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

function getDirectionsHelperText(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
): string {
  const isKorea = isKoreanLocation(spot.location.address);
  const locationConfidence = getLocationConfidence(spot);

  if (!isKorea && spot.googlePlaceId) {
    return "Maps opens with the matched Google Place ID from the spot photo source for a more precise destination.";
  }

  if (!isKorea && locationConfidence.tone === "exact") {
    return locationConfidence.usableCoordinates
      ? "Maps routes to the saved exact coordinate, with the spot name and address kept visible for context."
      : "Maps searches the exact spot name and address because no verified coordinate is stored yet.";
  }

  if (locationConfidence.tone === "area") {
    return isKorea
      ? "Kakao opens a name and area search because this source record does not have an exact address yet."
      : "Maps opens a name and area search because this source record does not have an exact address yet.";
  }

  if (isKorea && locationConfidence.tone === "pinned") {
    return "Kakao opens a name and area search because the saved pin still needs exact address confirmation.";
  }

  if (isKorea && locationConfidence.tone === "exact") {
    return locationConfidence.usableCoordinates
      ? "Kakao opens a route to the saved exact coordinate, with the spot name and address kept visible for context."
      : "Kakao searches the exact spot name and address because no verified coordinate is stored yet.";
  }

  return isKorea
    ? "Kakao searches the spot name and stored address because this record does not have a usable saved pin yet."
    : "Maps searches the spot name and stored address first, so the imported pin is only supporting context.";
}

function getLocationPlanningCopy(
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>,
) {
  const confidence = getLocationConfidence(spot);

  if (spot.googlePlaceId && !isKoreanLocation(spot.location.address)) {
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
        "The stored address and map evidence are specific enough for direct planning.",
      routeTitle: confidence.usableCoordinates
        ? "Navigate to exact coordinate"
        : "Navigate by name and address",
      locationHeading: "Exact location",
    };
  }

  if (confidence.tone === "pinned") {
    return {
      heading: "Confirm this pinned area",
      description:
        "This is area-level source data with a saved map pin. Maps search the name and area first until exact address enrichment confirms the route target.",
      routeTitle: "Search before routing",
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

function getSpotPrimaryUse(category: string): { value: string; helper: string } {
  const normalized = category.toLowerCase();

  if (normalized.includes("cafe")) {
    return {
      value: "Slow reset",
      helper: "Use it as a coffee stop, work break, or soft landing between denser walking pockets.",
    };
  }

  if (
    normalized.includes("food") ||
    normalized.includes("restaurant") ||
    normalized.includes("market")
  ) {
    return {
      value: "Meal anchor",
      helper: "Build the route around eating here, then keep nearby stops light and walkable.",
    };
  }

  if (normalized.includes("night") || normalized.includes("bar")) {
    return {
      value: "Evening anchor",
      helper: "Save it for later in the day when the local crowd signal matters most.",
    };
  }

  if (normalized.includes("shopping") || normalized.includes("store")) {
    return {
      value: "Browse pocket",
      helper: "Treat it as a wander-and-discover stop rather than a rushed errand.",
    };
  }

  if (
    normalized.includes("outdoor") ||
    normalized.includes("park") ||
    normalized.includes("beach")
  ) {
    return {
      value: "Breathing room",
      helper: "Give it enough time in the route so the stop does not feel squeezed.",
    };
  }

  return {
    value: "Route anchor",
    helper: "Use it as a flexible local stop around nearby food, coffee, markets, or evening plans.",
  };
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
    return " bg-[rgb(var(--ll-success)/0.12)] text-foreground";
  if (tone === "pinned") return " bg-primary/10 text-foreground";
  return " bg-[rgb(var(--ll-warning)/0.14)] text-foreground";
}

function getSignalToneClasses(tone: "emerald" | "sky" | "amber" | "violet") {
  if (tone === "emerald")
    return " bg-[rgb(var(--ll-success)/0.12)] text-foreground";
  if (tone === "sky") return " bg-primary/10 text-foreground";
  if (tone === "violet")
    return " bg-primary/10 text-foreground";
  return " bg-[rgb(var(--ll-warning)/0.14)] text-foreground";
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
    violet: " bg-primary/10 text-foreground",
    emerald: " bg-[rgb(var(--ll-success)/0.12)] text-foreground",
    sky: " bg-primary/10 text-foreground",
    amber: " bg-[rgb(var(--ll-warning)/0.14)] text-foreground",
  }[tone];

  return (
    <div className="rounded-lg bg-raised p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${toneClasses}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {label}
      </div>
      <p className="text-sm font-semibold leading-snug text-foreground">{value}</p>
      {helper && (
        <p className="mt-1 text-xs leading-5 text-foreground">{helper}</p>
      )}
    </div>
  );
}

function PlanningSnapshot({
  primaryUse,
  bestTime,
  routeTitle,
  routeHelper,
  photoLabel,
  photoHelper,
  locationTone,
  hasRealPhoto,
}: {
  primaryUse: { value: string; helper: string };
  bestTime: string;
  routeTitle: string;
  routeHelper: string;
  photoLabel: string;
  photoHelper: string;
  locationTone: ReturnType<typeof getLocationConfidence>["tone"];
  hasRealPhoto: boolean;
}) {
  const routeTone =
    locationTone === "exact" ? "emerald" : locationTone === "pinned" ? "sky" : "amber";

  return (
    <section className={`${LIQUID_CARD} overflow-hidden`} aria-label="Plan-ready snapshot">
      <div className="bg-raised p-3 sm:p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
              Plan-ready snapshot
            </p>
            <h2 className="text-lg font-bold leading-tight text-foreground sm:text-2xl">
              What this spot is good for
            </h2>
          </div>
        </div>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
        <DetailSignal
          icon={Compass}
          label="Use it as"
          value={primaryUse.value}
          helper={primaryUse.helper}
        />
        <DetailSignal
          icon={Clock}
          label="Best window"
          value={bestTime}
          helper="Visit advice, not opening hours. Confirm hours with the venue."
          tone="sky"
        />
        <DetailSignal
          icon={Route}
          label="Map behavior"
          value={routeTitle}
          helper={routeHelper}
          tone={routeTone}
        />
        <DetailSignal
          icon={Camera}
          label="Stored photo references"
          value={photoLabel}
          helper={photoHelper}
          tone={hasRealPhoto ? "violet" : "amber"}
        />
      </div>
    </section>
  );
}

function RecordConfidencePanel({
  confidence,
}: {
  confidence: ReturnType<typeof getSpotRecordConfidence>;
}) {
  const toneClasses = {
    emerald: " bg-[rgb(var(--ll-success)/0.12)] text-foreground",
    sky: " bg-primary/10 text-foreground",
    amber: " bg-[rgb(var(--ll-warning)/0.14)] text-foreground",
  }[confidence.tone];

  return (
    <section
      className={`${LIQUID_CARD} grid gap-3 p-3 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.6fr)] sm:p-4`}
      aria-label="Spot record confidence"
    >
      <div className="min-w-0">
        <span
          className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${toneClasses}`}
        >
          {confidence.label}
        </span>
        <p className="mt-2 text-sm leading-6 text-foreground">
          {confidence.helper}
        </p>
        <div className="mt-3 rounded-lg bg-raised p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Next best action
          </p>
          <p className="mt-1 text-sm font-semibold leading-5 text-foreground">
            {confidence.actionLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-foreground">
            {confidence.actionHelper}
          </p>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-3 gap-2">
        {confidence.checks.map((check) => (
          <div
            key={check.label}
            className="min-w-0 rounded-lg bg-raised p-2.5"
          >
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground">
              {check.ready ? (
                <ShieldCheck
                  className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--ll-success))]"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--ll-warning))]"
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{check.label}</span>
            </div>
            <p className="truncate text-xs font-semibold text-foreground sm:text-sm">
              {check.value}
            </p>
          </div>
        ))}
      </div>
    </section>
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
  const hasMatchedGooglePlace =
    Boolean(spot.googlePlaceId) &&
    !isKorea;
  const directionToneClass =
    locationConfidence.tone === "area"
      ? "bg-[rgb(var(--ll-warning))] text-[rgb(var(--ll-control-ink))] hover:bg-[rgb(var(--ll-warning)/0.9)]"
      : "";

  return (
    <Button
      asChild
      className={`w-full shadow-lg ${directionToneClass} ${compact ? "h-11 rounded-lg text-sm" : "h-12 rounded-xl text-lg"}`}
      size="lg"
    >
      <SpotEventLink
        spotId={spot.id}
        event="directions"
        data-testid="spot-directions-link"
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open directions to ${spot.name}`}
      >
        <Navigation className={compact ? "mr-2 h-4 w-4" : "mr-2 h-5 w-5"} />
        {getSpotDirectionsButtonLabel(
          locationConfidence.tone,
          isKorea,
          hasMatchedGooglePlace,
          locationConfidence.usableCoordinates,
        )}
      </SpotEventLink>
    </Button>
  );
}

function NavigationTargetPanel({
  spot,
  fallbackQuery,
  compact = false,
}: {
  spot: NonNullable<Awaited<ReturnType<typeof getSpot>>>;
  fallbackQuery: string;
  compact?: boolean;
}) {
  const locationConfidence = getLocationConfidence(spot);
  const city = getSpotContextCity(spot);
  const fallbackTarget = fallbackQuery || `${spot.name}, ${city}`;
  const lat = formatCoordinate(spot.location.lat);
  const lng = formatCoordinate(spot.location.lng);
  const hasMatchedGooglePlace =
    Boolean(spot.googlePlaceId) &&
    !isKoreanLocation(spot.location.address);
  const navigationMode = getSpotNavigationMode({
    tone: locationConfidence.tone,
    isKorea: isKoreanLocation(spot.location.address),
    hasMatchedGooglePlace,
    usableCoordinates: locationConfidence.usableCoordinates,
  });
  const isSearchFirst =
    navigationMode.status === "search_first_pin" ||
    navigationMode.status === "search_first_area";
  const targetValue = getSpotNavigationTargetValue({
    status: navigationMode.status,
    fallbackQuery: fallbackTarget,
    lat: spot.location.lat,
    lng: spot.location.lng,
  });

  return (
    <div
      data-testid="spot-detail-navigation-target"
      className={`rounded-lg bg-raised ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {navigationMode.targetLabel}
        </span>
        <span
          className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${getSignalToneClasses(
            getSpotNavigationSignalTone({
              status: navigationMode.status,
              locationTone: locationConfidence.tone,
            }),
          )}`}
        >
          {navigationMode.label}
        </span>
      </div>
      <p className="break-words text-sm font-semibold leading-6 text-foreground">
        {targetValue}
      </p>
      <p className="mt-2 break-words text-xs leading-5 text-foreground">
        Address on record:{" "}
        <span data-testid="spot-detail-address">{spot.location.address}</span>
      </p>
      {isSearchFirst && (
        <p className="mt-2 rounded-md bg-[rgb(var(--ll-warning)/0.14)] p-2 text-xs leading-5 text-foreground">
          {navigationMode.helper}
        </p>
      )}
      {hasMatchedGooglePlace && (
        <p className="mt-2 rounded-md bg-[rgb(var(--ll-success)/0.12)] p-2 text-xs leading-5 text-foreground">
          {navigationMode.helper}
        </p>
      )}
      {!isSearchFirst && !hasMatchedGooglePlace && (
        <p className="mt-2 rounded-md bg-[rgb(var(--ll-success)/0.12)] p-2 text-xs leading-5 text-foreground">
          {navigationMode.helper}
        </p>
      )}
      {lat && lng && (
        <p className="mt-2 text-xs text-foreground">
          {getSpotCoordinateEvidenceLabel({
            address: spot.location.address,
            tone: locationConfidence.tone,
            usableCoordinates: locationConfidence.usableCoordinates,
          })}
          : {lat}, {lng}
        </p>
      )}
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
    hasRealPhoto: photoSummary.hasRealPhoto,
    realPhotoCount: countRealDisplaySpotPhotos(normalizedPhotos),
    googlePlaceId: getTrustedSpotGooglePlaceId({
      photos: normalizedPhotos,
      storedGooglePlaceId: spot.google_place_id,
    }),
    tips: normalizeSpotTips(spot.tips),
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
        directPhotos: spot.google_place_id ? [] : normalizeSpotPhotos(spot.photos, category, 900).filter((photo) => !photo.includes("/api/places/photo")),
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
  const description = `${spot.description.slice(0, 160)}... Localley Score: ${spot.localleyScore}/6 • ${spot.location.address}`;

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
  const locationConfidence = getLocationConfidence(spot);
  const isKorea = isKoreanLocation(spot.location.address);
  const hasMatchedGooglePlace = Boolean(spot.googlePlaceId) && !isKorea;
  const navigationMode = getSpotNavigationMode({
    tone: locationConfidence.tone,
    isKorea,
    hasMatchedGooglePlace,
    usableCoordinates: locationConfidence.usableCoordinates,
  });
  const primaryArea = getPrimaryArea(spot.location.address, city);
  const scoreNarrative = getScoreNarrative(spot.localleyScore);
  const locationPlanningCopy = getLocationPlanningCopy(spot);
  const spotPrimaryUse = getSpotPrimaryUse(spot.category);
  const locationSignalTone = getSpotNavigationSignalTone({
    status: navigationMode.status,
    locationTone: locationConfidence.tone,
  });
  const relatedSpots = candidate ? [] : await getRelatedSpots(spot, city);
  let saveActor: string | null = null;
  if (candidate) {
    try { saveActor = await previewSavedSpotActor(); }
    catch { /* Candidate owner lookup failures never fall back to source writes. */ }
  }
  const hasDistanceRankedRelatedSpots = relatedSpots.some(
    (related) => related.distanceKm !== null,
  );
  const exactMapQuery = getSpotDirectionsSearchText({
    name: spot.name,
    address: spot.location.address,
  });
  const visitPlan = getSpotVisitPlan({
    category: spot.category,
    city,
    primaryArea,
    localleyScore: spot.localleyScore,
    localPercentage: spot.localPercentage,
    bestTime: spot.bestTime,
    locationTone: locationConfidence.tone,
    hasRealPhoto: spot.hasRealPhoto,
    realPhotoCount: spot.realPhotoCount,
  });
  const recordConfidence = getSpotRecordConfidence({
    hasRealPhoto: spot.hasRealPhoto,
    realPhotoCount: spot.realPhotoCount,
    locationTone: locationConfidence.tone,
    hasTrustedGooglePlaceId: Boolean(spot.googlePlaceId),
    verified: spot.verified,
  });

  return (
    <VenuePhotoProvider key={spot.id} spotId={spot.id} allowFetch={!candidate} directPhotos={spot.googlePlaceId ? [] : spot.photos.filter((photo: string) => !photo.includes("/api/places/photo"))}>
      {/* JSON-LD Structured Data */}
      <SpotJsonLd
        name={spot.name}
        description={spot.description}
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

      <div className="mx-auto max-w-6xl space-y-5 pb-4 animate-in fade-in duration-500 md:space-y-8">
        <Link
          href="/spots"
          className="inline-flex min-h-10 items-center rounded-full bg-raised px-3 text-sm text-foreground transition-colors hover:bg-overlay"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to spots
        </Link>

        <VenueHeroPhoto name={spot.name}>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
          <div className="absolute right-3 top-3 z-20 sm:right-4 sm:top-4">
            {!candidate && <SpotInteractions spotId={spot.id} spotName={spot.name} />}
            {candidate && saveActor && <PreviewSaveSpotButton spotId={spot.id} spotName={spot.name} actorId={saveActor} />}
          </div>

          <div className="absolute inset-x-0 bottom-0 w-full p-4 sm:p-6 md:p-8">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 sm:mb-3">
                <Badge variant="secondary">
                  {spot.category}
                </Badge>
                {spot.verified && (
                  <Badge
                    variant="outline"
                    className="bg-[rgb(var(--ll-success)/0.12)] text-foreground backdrop-blur-sm"
                  >
                    Curated record
                  </Badge>
                )}
                {spot.communitySubmission && (
                  <Badge
                    variant="outline"
                    className="bg-primary/10 text-foreground backdrop-blur-sm"
                  >
                    <UserRound className="mr-1 h-3.5 w-3.5" />
                    {spot.communitySubmission.status === "spot_reused"
                      ? "Community matched"
                      : "Community submitted"}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={
                    spot.hasRealPhoto
                      ? " bg-primary/10 text-foreground backdrop-blur-sm"
                      : " bg-[rgb(var(--ll-warning)/0.14)] text-foreground backdrop-blur-sm"
                  }
                >
                  <ImageIcon className="mr-1 h-3.5 w-3.5" />
                  {getSpotPhotoEvidenceLabel(spot)}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    locationConfidence.tone === "exact"
                      ? " bg-[rgb(var(--ll-success)/0.12)] text-foreground backdrop-blur-sm"
                      : locationConfidence.tone === "pinned"
                        ? " bg-primary/10 text-foreground backdrop-blur-sm"
                        : " bg-[rgb(var(--ll-warning)/0.14)] text-foreground backdrop-blur-sm"
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
              <h1 className="hidden text-4xl font-bold leading-tight text-foreground sm:block">
                {spot.name}
              </h1>
              <div className="mt-3 hidden items-start gap-2 text-sm leading-6 text-foreground sm:flex">
                <MapPin className="mt-1 h-4 w-4 shrink-0" />
                <span data-testid="spot-detail-address">
                  {spot.location.address}
                </span>
              </div>
            </div>
          </div>
        </VenueHeroPhoto>

        <section
          className={`${LIQUID_CARD} space-y-2 p-3 sm:hidden`}
          aria-label="Spot summary"
        >
          <h1 className="text-2xl font-bold leading-tight text-foreground">
            {spot.name}
          </h1>
          <div className="flex items-start gap-2 text-sm leading-6 text-foreground">
            <MapPin className="mt-1 h-4 w-4 shrink-0 text-primary" />
            <span data-testid="spot-detail-address">
              {spot.location.address}
            </span>
          </div>
        </section>

        <section
          data-testid="spot-detail-mobile-actions"
          className={`${LIQUID_CARD} space-y-3 p-3 lg:hidden`}
          aria-label="Spot planning actions"
        >
          <GetDirectionsButton spot={spot} compact />
          <DriverCardLink spotId={spot.id} name={spot.name} nameField={spot.nameField} address={spot.location.address} compact />
          <NavigationTargetPanel
            spot={spot}
            fallbackQuery={exactMapQuery}
            compact
          />
          <p className="text-xs leading-5 text-foreground">
            {getDirectionsHelperText(spot)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-raised p-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                {navigationMode.label}
              </span>
              <span className="mt-1 block truncate text-xs text-foreground">
                {primaryArea}
              </span>
            </div>
            <div className="rounded-lg bg-raised p-2.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Best time
              </span>
              <span className="mt-1 block truncate text-xs text-foreground">
                {spot.bestTime}
              </span>
              <p className="mt-1 text-xs text-foreground">Visit advice, not opening hours.</p>
            </div>
          </div>
        </section>

        <PlanningSnapshot
          primaryUse={spotPrimaryUse}
          bestTime={spot.bestTime}
          routeTitle={locationPlanningCopy.routeTitle}
          routeHelper={getDirectionsHelperText(spot)}
          photoLabel={getSpotPhotoEvidenceLabel(spot)}
          photoHelper={getSpotPhotoEvidenceHelper(spot)}
          locationTone={locationConfidence.tone}
          hasRealPhoto={spot.hasRealPhoto}
        />

        <RecordConfidencePanel confidence={recordConfidence} />

        {spot.communitySubmission && (
          <section className={`${LIQUID_CARD} p-4 sm:p-5`} aria-label="Community submission credit">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-foreground">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {spot.communitySubmission.status === "spot_reused"
                    ? "Found through the community"
                    : "Made by the community"}
                </p>
                <h2 className="mt-1 text-xl font-bold leading-tight text-foreground">
                  {spot.communitySubmission.status === "spot_reused"
                    ? `Matched by ${spot.communitySubmission.contributorCredit}`
                    : `Submitted by ${spot.communitySubmission.contributorCredit}`}
                </h2>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  Shared from {spot.communitySubmission.platform}.{" "}
                  {spot.communitySubmission.researchSummary ||
                    "Localley research converted the shared link into this spot record."}
                </p>
                <a
                  href={spot.communitySubmission.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary/10 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/15"
                >
                  View source post
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </section>
        )}

        <VenuePhotoThumbnails name={spot.name} />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-8">
          <div className="space-y-5 lg:col-span-2 lg:space-y-8">
            <div className="flex flex-wrap gap-2">
              {spot.subcategories.map((sub: string) => (
                <Badge
                  key={sub}
                  variant="secondary"
                  className="bg-primary/10 px-3 py-1 text-sm text-foreground"
                >
                  {sub}
                </Badge>
              ))}
            </div>

            <div className={`${LIQUID_CARD} space-y-4 p-4 sm:p-5`}>
              <p className="text-base leading-7 text-foreground sm:text-lg">
                {spot.description}
              </p>
            </div>

            <section className={`${LIQUID_CARD} space-y-4 p-4 sm:p-6`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                    Quick read
                  </p>
                  <h2 className="text-2xl font-bold leading-tight text-foreground">
                    Know before you route it
                  </h2>
                </div>
                <span className="w-fit rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-foreground">
                  {primaryArea}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <DetailSignal
                  icon={Compass}
                  label="Best for"
                  value={spotPrimaryUse.value}
                  helper={spotPrimaryUse.helper}
                />
                <DetailSignal
                  icon={Users}
                  label="Editorial estimate"
                  value={`${spot.localPercentage}% local`}
                  helper="Editorial estimate, not visitor count."
                  tone="emerald"
                />
                <DetailSignal
                  icon={Route}
                  label="Route precision"
                  value={navigationMode.label}
                  helper={navigationMode.helper}
                  tone={locationSignalTone}
                />
                <DetailSignal
                  icon={Camera}
                  label="Stored photo references"
                  value={getSpotPhotoEvidenceLabel(spot)}
                  helper={getSpotPhotoEvidenceHelper(spot)}
                  tone={spot.hasRealPhoto ? "violet" : "amber"}
                />
              </div>
            </section>

            <section className={`${LIQUID_CARD} space-y-4 p-4 sm:p-6`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                    Visit plan
                  </p>
                  <h2 className="text-2xl font-bold leading-tight text-foreground">
                    How to use {spot.name}
                  </h2>
                </div>
                <span
                  className={`w-fit rounded-md px-2 py-1 text-xs font-semibold ${getSignalToneClasses(locationSignalTone)}`}
                >
                  {navigationMode.label}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <DetailSignal
                  icon={Sparkles}
                  label="Why it matters"
                  value="Local route anchor"
                  helper={visitPlan.localReason}
                />
                <DetailSignal
                  icon={Clock}
                  label="Best use"
                  value={spot.bestTime}
                  helper={visitPlan.bestUse}
                  tone="sky"
                />
                <DetailSignal
                  icon={Route}
                  label="Pair nearby"
                  value={primaryArea}
                  helper={visitPlan.routePairing}
                  tone="emerald"
                />
                <DetailSignal
                  icon={Camera}
                  label="Evidence"
                  value={getSpotPhotoEvidenceLabel(spot)}
                  helper={visitPlan.evidence}
                  tone={spot.hasRealPhoto ? "violet" : "amber"}
                />
              </div>
            </section>

            <div className={`${LIQUID_CARD} overflow-hidden`}>
              <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4 p-4 sm:p-6">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Why locals go
                    </div>
                    <h2 className="text-2xl font-bold leading-tight text-foreground">
                      A curated stop{" "}
                      in {primaryArea}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-foreground">
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
                      helper="Editorial estimate, not visitor count."
                      tone="emerald"
                    />
                    <DetailSignal
                      icon={Clock}
                      label="Best window"
                      value={spot.bestTime}
                      helper="Visit advice, not opening hours. Confirm hours with the venue."
                      tone="sky"
                    />
                    <DetailSignal
                      icon={Camera}
                      label="Stored photo references"
                      value={getSpotPhotoEvidenceLabel(spot)}
                      helper={getSpotPhotoEvidenceHelper(spot)}
                      tone={spot.hasRealPhoto ? "violet" : "amber"}
                    />
                  </div>
                </div>

                <div className="bg-raised p-4 sm:p-6 md:border-t-0">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {locationPlanningCopy.heading}
                      </h3>
                      <p className="text-xs leading-5 text-foreground">
                        {locationPlanningCopy.description}
                      </p>
                    </div>
                    {locationConfidence.tone === "area" ? (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-[rgb(var(--ll-warning))]" />
                    ) : (
                      <ShieldCheck className="h-5 w-5 shrink-0 text-[rgb(var(--ll-success))]" />
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex gap-3 rounded-lg bg-black/10 p-3">
                      <Route className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {locationPlanningCopy.routeTitle}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-foreground">
                          {spot.name}, {spot.location.address}
                        </p>
                        <p
                          className={`mt-2 inline-flex rounded-md px-2 py-1 text-xs font-semibold ${getLocationToneClasses(locationConfidence.tone)}`}
                        >
                          {locationConfidence.label}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 rounded-lg bg-black/10 p-3">
                      <Compass className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Build nearby time around {primaryArea}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-foreground">
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
                  <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Users className="h-5 w-5 text-primary" />
                    Before you go
                  </h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {spot.tips.map((tip: string, i: number) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 rounded-lg bg-raised p-3 text-sm leading-6 text-foreground"
                      >
                        <div className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-foreground">
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
            {!candidate && <SpotActivities spotId={spot.id} city={city} spotName={spot.name} />}

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
                <h3 className="mb-4 font-semibold text-foreground">
                  Localley Score
                </h3>
                <div className="flex justify-center py-4">
                  <LocalleyScaleIndicator
                    score={spot.localleyScore}
                    className="scale-125"
                  />
                </div>
                <p className="mt-2 px-2 text-center text-sm text-foreground">
                  {spot.localleyScore === LocalleyScale.HIDDEN_GEM
                    ? "A rare find! Mostly locals and very few tourists know about this spot."
                    : "A great spot with a mix of people."}
                </p>
              </div>

              <div className="hidden lg:block">
                <GetDirectionsButton spot={spot} />
                <DriverCardLink spotId={spot.id} name={spot.name} nameField={spot.nameField} address={spot.location.address} />
              </div>

              <div className="overflow-hidden rounded-lg bg-raised">
                <SpotDetailMap lat={spot.location.lat} lng={spot.location.lng} name={spot.name} category={spot.category} photos={spot.photos}
                  searchUrl={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(exactMapQuery)}`} />
                <div className="p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    {locationConfidence.tone === "area" ? (
                      <AlertTriangle className="h-4 w-4 text-[rgb(var(--ll-warning))]" />
                    ) : (
                      <MapPin className="h-4 w-4 text-primary" />
                    )}
                    {locationPlanningCopy.locationHeading}
                  </h3>
                  <p
                    data-testid="spot-detail-sidebar-address"
                    className="text-sm leading-6 text-foreground"
                  >
                    {spot.location.address}
                  </p>
                  <div className="mt-3">
                    <NavigationTargetPanel
                      spot={spot}
                      fallbackQuery={exactMapQuery}
                    />
                  </div>
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
                        !isKoreanLocation(spot.location.address) &&
                        locationConfidence.tone === "exact"
                          ? "Uses a Google Place match where supported."
                          : locationConfidence.description
                      }
                      tone={locationSignalTone}
                    />
                  </div>
                  <p className="mt-2 rounded-md bg-primary/10 p-2 text-xs leading-5 text-foreground">
                    {locationConfidence.description}{" "}
                    {getDirectionsHelperText(spot)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {relatedSpots.length > 0 && (
          <section className={`${LIQUID_CARD} p-4 sm:p-6`}>
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  {hasDistanceRankedRelatedSpots ? "Closest picks" : "Same-city picks"}
                </p>
                <h2 className="text-2xl font-bold leading-tight text-foreground">
                  {hasDistanceRankedRelatedSpots
                    ? "Build nearby stops into the route"
                    : "Build the same city into a route"}
                </h2>
              </div>
              {citySlug ? (
                <Link
                  href={`/spots?city=${encodeURIComponent(citySlug)}`}
                  className="text-sm font-semibold text-foreground transition-colors hover:text-foreground"
                >
                  More in {city}
                </Link>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {relatedSpots.map((related) => (
                <div
                  key={related.id}
                  className="group relative overflow-hidden rounded-lg bg-raised transition-all duration-300 hover:-translate-y-0.5 hover:bg-raised"
                >
                  <div className="relative overflow-hidden bg-raised">
                    <VenueCardPhoto spotId={related.id} name={related.name} directPhotos={related.directPhotos} frameClassName="aspect-[4/3] w-full" />
                    <span className="absolute left-2 top-2 rounded-full bg-black/80 px-2 py-1 text-xs font-semibold text-foreground">
                      {related.category}
                    </span>
                    <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground backdrop-blur">
                      {related.localleyScore}/6
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <div>
                      <h3 className="line-clamp-1 font-semibold text-foreground group-hover:text-foreground">
                        <Link href={`/spots/${related.id}`} className="after:absolute after:inset-0 after:z-[1] focus-visible:outline focus-visible:outline-2">{related.name}</Link>
                      </h3>
                      <p className="mt-1 line-clamp-1 text-xs text-foreground">
                        {related.address}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs font-medium">
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-foreground">
                        {related.distanceLabel}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </VenuePhotoProvider>
  );
}
