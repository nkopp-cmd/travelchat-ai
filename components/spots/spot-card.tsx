"use client";

import { VenueCardPhoto } from "./spot-photo-image";
import Link from "next/link";
import { Spot } from "@/types";
import { SaveSpotButton } from "./save-spot-button";
import { Card } from "@/components/ui/card";
import {
  MapPin,
  Navigation,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";

interface SpotCardProps {
  spot: Spot;
  compact?: boolean;
  /** Set to true for above-the-fold images (first 6 cards) */
  priority?: boolean;
}

function CommunitySpotChip() {
  return (
    <span
      aria-label="Community submitted spot"
      title="Community submitted spot"
      className="inline-flex h-6 items-center gap-1 rounded-md border border-fuchsia-200/25 bg-fuchsia-500/75 px-1.5 text-[10px] font-semibold text-white shadow-md shadow-black/20 backdrop-blur"
    >
      <Users className="h-3 w-3" aria-hidden="true" />
      <span>Community</span>
    </span>
  );
}

function getScoreTone(score: number) {
  if (score >= 6)
    return "border-fuchsia-300/25 bg-fuchsia-400/12 text-fuchsia-100";
  if (score >= 5)
    return "border-violet-300/25 bg-violet-400/12 text-violet-100";
  if (score >= 4)
    return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  return "border-sky-300/20 bg-sky-400/10 text-sky-100";
}

function SpotScoreChip({
  score,
  className,
  showLabel = false,
}: {
  score: number;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <span
      data-layout-chip
      data-testid="spot-score-chip"
      className={cn(
        "inline-flex h-6 min-w-0 max-w-full shrink-0 items-center gap-1 overflow-hidden rounded-md border px-1.5 text-[10px] font-semibold leading-none sm:h-7 sm:rounded-full sm:px-2 sm:text-[11px]",
        getScoreTone(score),
        className,
      )}
      title={`Localley score ${score} out of 6`}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      <span className="truncate">{score}/6</span>
      {showLabel && <span className="hidden sm:inline">Localley</span>}
    </span>
  );
}

function LocationConfidenceChip({
  spot,
  className,
}: {
  spot: Spot;
  className?: string;
}) {
  const confidence = getSpotLocationConfidence({
    address: spot.location.address,
    lat: spot.location.lat,
    lng: spot.location.lng,
  });
  const hasPlaceMatch = Boolean(spot.googlePlaceId);

  return (
    <span
      data-layout-chip
      data-testid="spot-location-confidence-chip"
      className={cn(
        "inline-flex h-6 min-w-0 max-w-full shrink-0 items-center gap-1 overflow-hidden rounded-md border px-1.5 text-[10px] font-semibold leading-none sm:h-7 sm:rounded-full sm:px-2 sm:text-[11px]",
        hasPlaceMatch || confidence.tone === "exact"
          ? "border-sky-200/20 bg-sky-400/10 text-sky-100"
          : confidence.tone === "pinned"
            ? "border-indigo-200/20 bg-indigo-400/10 text-indigo-100"
            : "border-amber-200/25 bg-amber-400/10 text-amber-100",
        className,
      )}
      title={
        hasPlaceMatch
          ? "Google Place match available for directions"
          : confidence.description
      }
    >
      <Navigation className="h-3 w-3" aria-hidden="true" />
      <span className="truncate">
        {hasPlaceMatch
           ? "Place matched"
          : confidence.tone === "exact"
            ? "Exact"
            : confidence.tone === "pinned"
              ? "Check pin"
              : "Area only"}
      </span>
    </span>
  );
}

function TrendingChip({
  className,
  showLabel = false,
  iconOnly = false,
}: {
  className?: string;
  showLabel?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <span
      data-layout-chip
      data-testid="spot-trending-chip"
      className={cn(
        "inline-flex h-5 min-w-0 max-w-full shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-rose-200/25 bg-rose-400/10 px-1.5 text-[10px] font-semibold leading-none text-rose-100",
        className,
      )}
      title="Trending"
    >
      <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
      {showLabel && !iconOnly ? (
        <span className="truncate">Trending</span>
      ) : (
        <>
          {!iconOnly && (
            <span className="hidden truncate min-[430px]:inline">Hot</span>
          )}
          <span className="sr-only">Trending</span>
        </>
      )}
    </span>
  );
}

function CategoryTrendRow({
  category,
  trending,
  compact = false,
  hideTrendText = false,
  className,
}: {
  category: string;
  trending?: boolean;
  compact?: boolean;
  hideTrendText?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full items-center gap-1 overflow-hidden",
        className,
      )}
    >
      <span
        data-layout-chip
        data-testid="spot-category-chip"
        className={cn(
          "min-w-0 shrink truncate rounded-md border border-violet-200/20 bg-violet-400/10 font-medium leading-none text-violet-100",
          compact
            ? "max-w-[6.5rem] px-1.5 py-1 text-[9px] min-[390px]:max-w-[8rem] min-[390px]:px-2 min-[390px]:text-[10px]"
            : "px-1.5 py-1 text-[10px] sm:rounded-full sm:px-2.5 sm:text-[11px]",
        )}
        title={category}
      >
        {category}
      </span>
      {trending && (
        <TrendingChip
          className={cn(
            "shrink-0",
            compact ? "h-5 max-w-[3.2rem] px-1.5 min-[430px]:max-w-[4.75rem]" : "max-w-[4.5rem]",
          )}
          showLabel={!compact && !hideTrendText}
          iconOnly={hideTrendText}
        />
      )}
    </div>
  );
}

export function SpotCard({
  spot,
  compact = false,
  priority = false,
}: SpotCardProps) {
  if (compact) {
    // Premium compact horizontal card for list view
    return (
      <Card
        data-testid="spot-card"
        data-spot-card="list"
        className={cn(
          "group relative flex flex-row overflow-hidden rounded-lg !gap-0 !py-0",
          "bg-[#100b1c]/92 text-white backdrop-blur-xl",
          "border border-violet-200/15",
          "transition-all duration-300 ease-out",
          "hover:shadow-xl hover:shadow-violet-500/10",
          "hover:border-violet-300/45",
          "hover:-translate-y-0.5",
        )}
      >
        <div
          data-testid="spot-card-photo"
          className="relative aspect-[4/3] w-[4.75rem] flex-shrink-0 overflow-hidden bg-violet-950/60 min-[390px]:w-24 sm:w-32 md:w-36"
        >
          <VenueCardPhoto key={spot.id} spotId={spot.id} name={spot.name} priority={priority} directPhotos={spot.googlePlaceId ? [] : spot.photos} />
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col p-2 sm:p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/spots/${spot.id}`}
                className="block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100b1c]"
              >
                <h3
                  data-testid="spot-card-title"
                  className="line-clamp-1 text-sm font-semibold leading-tight text-white transition-colors duration-200 group-hover:text-violet-100 sm:text-base"
                >
                  {spot.name}
                </h3>
              </Link>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-violet-50/60 sm:text-sm">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" />
                <span className="truncate">{spot.location.address}</span>
              </p>
            </div>
            <div className="relative z-20 flex flex-shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-0.5 backdrop-blur sm:p-1">
              <SaveSpotButton
                spotId={spot.id}
                spotName={spot.name}
                size="sm"
                className="h-7 w-7 bg-white/10 p-0 hover:bg-white/20 [&_svg]:h-3.5 [&_svg]:w-3.5"
              />
            </div>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-violet-50/60 min-[480px]:line-clamp-1 sm:mt-1.5 sm:text-sm">
            {spot.description}
          </p>
          <div className="mt-auto min-w-0 border-t border-white/10 pt-1.5 text-xs text-violet-50/60 sm:pt-2">
            <div
              data-spot-card-meta
              className="grid min-w-0 grid-cols-1 gap-1 overflow-hidden min-[430px]:grid-cols-[minmax(0,1fr)_auto] sm:flex sm:flex-wrap sm:items-center sm:overflow-visible"
            >
              {spot.communitySubmitted && <CommunitySpotChip />}
              <CategoryTrendRow
                category={spot.category}
                trending={spot.trending}
                compact
                className="max-w-full"
              />
              <div className="flex min-w-0 items-center gap-1 min-[430px]:justify-end sm:contents">
                <LocationConfidenceChip
                  spot={spot}
                  className="max-w-[7.25rem]"
                />
                <SpotScoreChip
                  score={spot.localleyScore}
                  className="max-w-[3.75rem]"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Premium grid card with glassmorphism and micro-animations
  return (
    <Card
      data-testid="spot-card"
      data-spot-card="grid"
      className={cn(
        "group relative flex min-h-[4.5rem] flex-row items-stretch overflow-hidden rounded-lg !gap-0 !py-0 md:min-h-0 md:flex-col",
        "bg-[#100b1c]/92 text-white backdrop-blur-xl",
        "border border-violet-200/15",
        "transition-all duration-300 ease-out",
        "shadow-md shadow-violet-950/20",
        "hover:shadow-xl hover:shadow-violet-500/20",
        "hover:border-violet-300/45",
        "hover:-translate-y-0.5",
      )}
    >
      <div
        data-testid="spot-card-photo"
        className="relative w-[4.75rem] shrink-0 overflow-hidden bg-violet-950/60 min-[390px]:w-24 md:aspect-[2/1] md:w-full"
      >
        <VenueCardPhoto key={spot.id} spotId={spot.id} name={spot.name} priority={priority} directPhotos={spot.googlePlaceId ? [] : spot.photos} />
      </div>
      <div className="absolute right-1.5 top-1.5 z-20 hidden md:right-2.5 md:top-2.5 md:block">
        <div className="flex-shrink-0 rounded-full border border-white/20 bg-black/42 p-1 shadow-lg shadow-black/15 backdrop-blur-md transition-all duration-300 hover:scale-105 focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <SaveSpotButton
            spotId={spot.id}
            spotName={spot.name}
            className="h-7 w-7 bg-white/90 p-0 text-slate-900 hover:bg-white md:h-8 md:w-8"
          />
        </div>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col p-2 sm:p-2.5">
        <div className="mb-1.5 hidden min-w-0 md:block">
          <div className="min-w-0">
            <CategoryTrendRow
              category={spot.category}
              trending={spot.trending}
            />
          </div>
        </div>

        <div className="mb-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 md:mb-0 md:block">
          <Link
            href={`/spots/${spot.id}`}
            className="block min-w-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100b1c]"
          >
            <h3
              data-testid="spot-card-title"
              className="line-clamp-1 text-sm font-semibold leading-snug text-white transition-colors duration-200 group-hover:text-violet-100 sm:text-[15px]"
            >
              {spot.name}
            </h3>
          </Link>
          <div className="relative z-20 shrink-0 md:hidden">
            <SaveSpotButton
              spotId={spot.id}
              spotName={spot.name}
              className="h-7 w-7 bg-white/10 p-0 text-white hover:bg-white/20 [&_svg]:h-3.5 [&_svg]:w-3.5"
            />
          </div>
        </div>

        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-violet-50/55 md:mt-1">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" />
          <span className="truncate">{spot.location.address}</span>
        </p>

        <p className="mt-1 hidden text-xs leading-5 text-violet-50/58 min-[390px]:line-clamp-1 md:line-clamp-2">
          {spot.description}
        </p>

        <div className="mt-auto min-w-0 border-t border-white/10 pt-1.5">
          <div
            data-spot-card-meta
              className="grid min-w-0 grid-cols-1 gap-1 overflow-hidden md:flex md:flex-wrap md:items-center md:overflow-visible"
            >
            {spot.communitySubmitted && <CommunitySpotChip />}
            <CategoryTrendRow
              category={spot.category}
              trending={spot.trending}
              compact
              hideTrendText
              className="min-w-0 md:hidden"
            />
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 md:contents">
              <LocationConfidenceChip
                spot={spot}
                className="max-w-full"
              />
              <SpotScoreChip
                score={spot.localleyScore}
                showLabel
                className="justify-self-end"
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
