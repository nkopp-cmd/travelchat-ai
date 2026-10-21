"use client";

import Image from "next/image";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2,
  MapPin,
  Clock,
  DollarSign,
  ExternalLink,
  Star,
  Navigation,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { SubscriptionTier, hasFeature } from "@/lib/subscription";
import {
  getActivityBookingLinks,
  getHotelBookingLinks,
} from "@/lib/affiliates";
import { BookingDealsPopover } from "./booking-deals-popover";
import { usePlacePhoto } from "@/hooks/use-place-photo";
import { useVenuePhotos } from "@/components/spots/venue-photo-provider";
import { SpotPhotoImage } from "@/components/spots/spot-photo-image";
import { CityImageAvatar } from "@/components/ui/city-image";
import {
  buildActivityMapUrl,
  getPreferredActivityMapAddress,
  hasExactActivityAddress,
} from "@/lib/itineraries/map-links";
import { isKoreanCity } from "@/hooks/use-map-provider";

interface ItineraryActivity {
  spotId?: string;
  name: string;
  nameKo?: string;
  description?: string;
  time?: string;
  duration?: string;
  cost?: string;
  address?: string;
  type?: string;
  category?: string;
  localleyScore?: number;
  image?: string;
  thumbnail?: string;
}

interface ItineraryActivityCardProps {
  activity: ItineraryActivity;
  city: string;
  userTier?: SubscriptionTier;
  isLast?: boolean;
  position?: number;
}

// Get Localley score badge
const getScoreBadge = (score: number) => {
  if (score >= 6)
    return {
      label: "Legendary",
      className: " bg-[rgb(var(--ll-warning)/0.14)] text-foreground",
    };
  if (score >= 5)
    return {
      label: "Hidden gem",
      className: " bg-primary/15 text-foreground",
    };
  if (score >= 4)
    return {
      label: "Local favorite",
      className: " bg-primary/15 text-foreground",
    };
  return {
    label: "Mixed crowd",
    className: " bg-primary/10 text-foreground",
  };
};

function formatActivityType(type: string) {
  return type
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getMapConfidenceCopy({
  hasExactStoredAddress,
  hasMatchedPlace,
}: {
  hasExactStoredAddress: boolean;
  hasMatchedPlace: boolean;
}) {
  if (hasExactStoredAddress) {
    return {
      label: "Exact pin",
      className: " bg-[rgb(var(--ll-success)/0.12)] text-foreground",
      helper: "Directions open the saved street address.",
      buttonLabel: "Open pin",
    };
  }

  if (hasMatchedPlace) {
    return {
      label: "Verified pin",
      className: " bg-[rgb(var(--ll-success)/0.12)] text-foreground",
      helper: "Matched with place data for a more exact map result.",
      buttonLabel: "Open pin",
    };
  }

  return {
    label: "Confirm pin",
    className: " bg-[rgb(var(--ll-warning)/0.14)] text-foreground",
    helper: "Only an area or name is available. Choose the correct map result before routing.",
    buttonLabel: "Confirm map",
  };
}

export function ItineraryActivityCard({
  activity,
  city,
  userTier = "free",
  isLast = false,
  position,
}: ItineraryActivityCardProps) {
  const [failedImageState, setFailedImageState] = useState<{
    key: string;
    sources: Set<string>;
  }>({ key: "", sources: new Set() });
  const scoreBadge = activity.localleyScore
    ? getScoreBadge(activity.localleyScore)
    : null;
  const showDeals = hasFeature(userTier, "bookingDeals");
  const storedActivityImage = activity.image || activity.thumbnail;
  // Stored Google references expire. Resolve a fresh, attributed gallery only
  // through the grounded spot ID; never guess a new venue from an old photo.
  const storedProxy = Boolean(storedActivityImage && /^\/api\/places\/photo(?:\?|$)/.test(storedActivityImage));
  const sourceSpotId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activity.spotId || "") ? activity.spotId! : "";
  const { ref: photoRef, data: venuePhotoData, loading: venuePhotosLoading } = useVenuePhotos(sourceSpotId, false, [], storedProxy && Boolean(sourceSpotId));
  const hasExactStoredAddress = hasExactActivityAddress(activity.address);

  // Fetch Google Places details when the card needs a real image or address.
  const placeData = usePlacePhoto(activity.name, city, {
    existingImage: storedActivityImage,
    userTier,
    includeDetails: !hasExactStoredAddress,
  });

  const imageCandidates = [storedActivityImage, placeData.photoUrl].filter(
    (src): src is string => Boolean(src),
  );
  const imageKey = imageCandidates.join("|");
  const failedImages =
    failedImageState.key === imageKey
      ? failedImageState.sources
      : new Set<string>();
  const displayImage =
    imageCandidates.find((src) => !failedImages.has(src)) || null;
  const isStoredActivityImage = Boolean(
    storedActivityImage && displayImage === storedActivityImage,
  );
  const displayRating = placeData.rating;
  const displayTotalRatings = placeData.totalRatings;

  const handleImageError = (src: string) => {
    setFailedImageState((current) => {
      const next = new Set(current.key === imageKey ? current.sources : []);
      next.add(src);
      return { key: imageKey, sources: next };
    });
  };

  // Get booking links
  const bookingLinks = getActivityBookingLinks({
    activityName: activity.name,
    city,
    category: activity.category,
  });

  const hotelLinks = getHotelBookingLinks({ city });

  const matchedAddress = placeData.formattedAddress || "";
  const preferredMapAddress = getPreferredActivityMapAddress(
    activity,
    matchedAddress,
  );
  const displayAddress =
    preferredMapAddress ||
    `Search by "${activity.name}" in ${city}`;
  const placeIdMapUrl =
    !isKoreanCity(city) && placeData.placeId
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [activity.name, matchedAddress || city].filter(Boolean).join(", "),
        )}&query_place_id=${encodeURIComponent(placeData.placeId)}`
      : null;
  const exactMapUrl =
    placeIdMapUrl ||
    buildActivityMapUrl(
      { ...activity, address: preferredMapAddress || undefined },
      city,
    );
  const hasMatchedPlace = Boolean(placeData.placeId || matchedAddress);
  const mapConfidence = getMapConfidenceCopy({
    hasExactStoredAddress,
    hasMatchedPlace,
  });

  return (
    <div
      className={cn(
        "relative pl-3 sm:pl-5",
        !isLast && "pb-3 sm:pb-4",
      )}
    >
      {/* Timeline Dot */}
      <div className="absolute -left-2.5 top-3.5 sm:-left-3 sm:top-5">
        <div className="grid h-5 w-5 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground sm:h-6 sm:w-6 sm:text-xs">
          {position ?? ""}
        </div>
      </div>

      <div className="group overflow-hidden rounded-lg bg-surface backdrop-blur-xl transition-colors hover:bg-raised sm:rounded-xl">
        <div className="flex gap-2 p-2 sm:gap-4 sm:p-3">
          {/* Activity Thumbnail - shows existing image or Google Places photo */}
          <div className="flex-shrink-0">
            <div ref={photoRef} className={cn("relative overflow-hidden rounded-lg bg-primary/15 sm:rounded-xl", storedProxy ? "w-24 sm:w-28" : "h-16 w-16 min-[420px]:h-[76px] min-[420px]:w-[76px] sm:h-24 sm:w-28")}>
              {storedProxy ? (
                <SpotPhotoImage photo={venuePhotoData?.photos[0]} alt={activity.name}
                  sizes="(max-width: 640px) 96px, 112px" frameClassName="aspect-square w-full"
                  loading={Boolean(sourceSpotId) && venuePhotosLoading} />
              ) : displayImage ? (
                isStoredActivityImage ? (
                  <Image
                    src={displayImage}
                    alt={activity.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 419px) 64px, (max-width: 640px) 76px, 112px"
                    quality={90}
                    onError={() => handleImageError(displayImage)}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={displayImage}
                    alt={activity.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                    onError={() => handleImageError(displayImage)}
                  />
                )
              ) : (
                <CityImageAvatar
                  city={city}
                  className="h-full w-full rounded-none"
                  sizes="(max-width: 419px) 64px, (max-width: 640px) 76px, 112px"
                  imageWidth={360}
                  quality={90}
                />
              )}
              {placeData.isLoading && (
                <div className="absolute inset-0 bg-muted/50 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                </div>
              )}
              {activity.time && (
                <span className={cn("absolute left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white backdrop-blur", storedProxy ? "top-1.5" : "bottom-1.5")}>
                  {activity.time}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
            {/* Activity Header */}
            <div className="flex flex-col gap-2">
              <div className="min-w-0 space-y-1.5">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-bold leading-snug text-foreground sm:text-base">
                    {activity.name}
                  </h3>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {scoreBadge && (
                    <Badge
                      className={cn(
                        "h-5 rounded-full px-1.5 text-xs font-semibold sm:px-2",
                        scoreBadge.className,
                      )}
                    >
                      {scoreBadge.label}
                    </Badge>
                  )}
                  {activity.category && (
                    <Badge
                      variant="secondary"
                      className="hidden h-5 rounded-full bg-raised px-2 text-xs text-foreground min-[420px]:inline-flex"
                    >
                      {activity.category}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-5 rounded-full px-1.5 text-xs sm:px-2",
                      mapConfidence.className,
                    )}
                  >
                    {mapConfidence.label}
                  </Badge>
                </div>
                <div className="grid min-w-0 gap-1">
                  <div className="flex min-w-0 items-start gap-1 text-xs text-muted-foreground sm:text-sm">
                    <MapPin
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 flex-shrink-0",
                        hasExactStoredAddress || hasMatchedPlace
                          ? "text-[rgb(var(--ll-success))]"
                          : "text-primary",
                      )}
                    />
                    <span className="line-clamp-2 min-w-0 break-words">
                      {displayAddress}
                    </span>
                  </div>
                  {displayRating && (
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[rgb(var(--ll-warning)/0.14)] px-1.5 py-0.5 text-xs font-medium text-foreground">
                      <Star className="h-3 w-3 fill-yellow-400 text-[rgb(var(--ll-warning))]" />
                      {displayRating.toFixed(1)}
                      {displayTotalRatings && (
                        <span className="text-xs">
                          ({displayTotalRatings.toLocaleString()})
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-4 text-foreground sm:text-xs">
                  {mapConfidence.helper}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {activity.type && (
                  <Badge
                    variant="outline"
                    className="h-6 rounded-full bg-raised px-2 text-foreground"
                  >
                    {formatActivityType(activity.type)}
                  </Badge>
                )}
              </div>
            </div>

            {/* Activity Description */}
            {activity.description && (
              <p className="text-xs leading-relaxed text-foreground min-[420px]:text-sm">
                {activity.description}
              </p>
            )}

            {/* Activity Details */}
            <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-xs sm:gap-x-3 sm:text-sm">
              {activity.duration && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{activity.duration}</span>
                </div>
              )}
              {activity.cost && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>{activity.cost}</span>
                </div>
              )}
            </div>

            {/* Booking & Maps */}
            <div className="flex flex-wrap gap-1.5 pt-0.5 sm:gap-2 sm:pt-1">
              <BookingDealsPopover
                activityLinks={bookingLinks.slice(0, 2)}
                hotelLinks={hotelLinks.slice(0, 1)}
                activityName={activity.name}
                showDeals={showDeals}
              />
              {exactMapUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs text-foreground hover:bg-primary/15 sm:rounded-full sm:px-3"
                  onClick={() =>
                    window.open(exactMapUrl, "_blank", "noopener,noreferrer")
                  }
                  aria-label={`Open map location for ${activity.name}`}
                >
                  <Navigation className="h-3.5 w-3.5" />
                  {mapConfidence.buttonLabel}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
