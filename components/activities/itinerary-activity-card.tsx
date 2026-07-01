"use client";

import Image from "next/image";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Clock,
  DollarSign,
  ExternalLink,
  Star,
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SubscriptionTier,
  canSeeFullAddress,
  hasFeature,
} from "@/lib/subscription";
import {
  getActivityBookingLinks,
  getHotelBookingLinks,
} from "@/lib/affiliates";
import { BookingDealsPopover } from "./booking-deals-popover";
import { usePlacePhoto } from "@/hooks/use-place-photo";
import { CityImageAvatar } from "@/components/ui/city-image";
import { buildActivityMapUrl } from "@/lib/itineraries/map-links";

interface ItineraryActivity {
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
      className: "border-amber-300/25 bg-amber-400/15 text-amber-100",
    };
  if (score >= 5)
    return {
      label: "Hidden gem",
      className: "border-violet-300/25 bg-violet-400/15 text-violet-100",
    };
  if (score >= 4)
    return {
      label: "Local favorite",
      className: "border-indigo-300/25 bg-indigo-400/15 text-indigo-100",
    };
  return {
    label: "Mixed crowd",
    className: "border-sky-300/25 bg-sky-400/15 text-sky-100",
  };
};

function formatActivityType(type: string) {
  return type
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function compactAddress(address: string, city: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) return `${parts.at(-2)}, ${parts.at(-1)}`;
  if (parts.length >= 2) return `${parts.at(-2)}, ${city}`;
  return `${city} area`;
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
  const canShowFullAddress = canSeeFullAddress(userTier);
  const showDeals = hasFeature(userTier, "bookingDeals");

  // Fetch Google Places photo + rating for paid users when no existing image
  const placeData = usePlacePhoto(activity.name, city, {
    existingImage: activity.image,
    userTier,
  });

  const imageCandidates = [activity.image, placeData.photoUrl].filter(
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
    activity.image && displayImage === activity.image,
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

  const displayAddress = canShowFullAddress
    ? activity.address
    : activity.address
      ? compactAddress(activity.address, city)
      : `${city} Area`;
  const mapActivity = canShowFullAddress
    ? activity
    : { name: activity.name, nameKo: activity.nameKo };
  const exactMapUrl = buildActivityMapUrl(mapActivity, city);
  const hasExactAddress =
    canShowFullAddress && Boolean(activity.address?.trim());

  return (
    <div
      className={cn(
        "relative border-l border-violet-300/20 pl-4 sm:pl-5",
        !isLast && "pb-3 sm:pb-4",
      )}
    >
      {/* Timeline Dot */}
      <div className="absolute -left-3 top-4 sm:top-5">
        <div className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#12091f] bg-violet-400 text-[10px] font-bold text-violet-950 shadow-lg shadow-violet-500/35">
          {position ?? ""}
        </div>
      </div>

      <div className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.055] shadow-lg shadow-violet-950/10 backdrop-blur-xl transition-colors hover:border-violet-300/35 hover:bg-white/[0.075]">
        <div className="flex gap-2.5 p-2.5 sm:gap-4 sm:p-3">
          {/* Activity Thumbnail - shows existing image or Google Places photo */}
          <div className="flex-shrink-0">
            <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-violet-950/20 sm:h-24 sm:w-28 sm:rounded-xl">
              {displayImage ? (
                isStoredActivityImage ? (
                  <Image
                    src={displayImage}
                    alt={activity.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 80px, 112px"
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
                  sizes="112px"
                  imageWidth={360}
                  quality={90}
                />
              )}
              {placeData.isLoading && (
                <div className="absolute inset-0 bg-muted/50 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {activity.time && (
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  {activity.time}
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            {/* Activity Header */}
            <div className="flex flex-col gap-2">
              <div className="min-w-0 space-y-1.5">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-bold leading-snug text-foreground sm:text-base">
                    {activity.name}
                  </h3>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {scoreBadge && (
                    <Badge
                      className={cn(
                        "h-5 rounded-full border px-2 text-[10px] font-semibold",
                        scoreBadge.className,
                      )}
                    >
                      {scoreBadge.label}
                    </Badge>
                  )}
                  {activity.category && (
                    <Badge
                      variant="secondary"
                      className="h-5 rounded-full border border-white/10 bg-white/[0.06] px-2 text-[10px] text-violet-100"
                    >
                      {activity.category}
                    </Badge>
                  )}
                  {hasExactAddress && (
                    <Badge
                      variant="outline"
                      className="h-5 rounded-full border-emerald-300/20 bg-emerald-400/10 px-2 text-[10px] text-emerald-100"
                    >
                      Exact address
                    </Badge>
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="flex min-w-0 items-start gap-1 text-xs text-muted-foreground sm:text-sm">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-300" />
                    <span className="line-clamp-2 min-w-0 break-words">
                      {displayAddress}
                    </span>
                  </div>
                  {/* Google Places rating */}
                  {displayRating && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/15 bg-amber-400/10 px-1.5 py-0.5 text-xs font-medium text-amber-100/85">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {displayRating.toFixed(1)}
                      {displayTotalRatings && (
                        <span className="text-xs">
                          ({displayTotalRatings.toLocaleString()})
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {activity.type && (
                  <Badge
                    variant="outline"
                    className="h-6 rounded-full border-white/10 bg-white/[0.04] px-2 text-violet-100/80"
                  >
                    {formatActivityType(activity.type)}
                  </Badge>
                )}
              </div>
            </div>

            {/* Activity Description */}
            {activity.description && (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground sm:line-clamp-3">
                {activity.description}
              </p>
            )}

            {/* Activity Details */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm">
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
            <div className="flex flex-wrap gap-2 pt-1">
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
                  className="h-8 gap-1.5 rounded-full border-violet-400/20 bg-violet-400/10 px-3 text-xs text-violet-100 hover:bg-violet-400/15"
                  onClick={() =>
                    window.open(exactMapUrl, "_blank", "noopener,noreferrer")
                  }
                  aria-label={`Open map location for ${activity.name}`}
                >
                  <Navigation className="h-3.5 w-3.5" />
                  {hasExactAddress ? "Exact map" : "Search map"}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
              {!canShowFullAddress && activity.address && (
                <span className="inline-flex h-8 items-center rounded-full border border-violet-400/15 bg-violet-400/10 px-3 text-xs font-medium text-violet-100/80">
                  Full address on paid plans
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
