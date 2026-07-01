"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Spot } from "@/types";
import { SaveSpotButton } from "./save-spot-button";
import { Card } from "@/components/ui/card";
import {
  ImageIcon,
  MapPin,
  Navigation,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCityGradient } from "@/lib/city-images";
import { inferSpotContextCity } from "@/lib/spots/city-context";
import { getSpotLocationConfidence } from "@/lib/spots/location-confidence";
import { addFallbackToPlacePhotoUrl } from "@/lib/place-images";
import { getSpotFallbackImageUrl } from "@/lib/spots/spot-fallback-images";
import {
  getFirstRealDisplaySpotPhoto,
  hasRealDisplaySpotPhoto,
} from "@/lib/spots/display-images";

const PLACEHOLDER_IMAGE = "/images/placeholders/default.svg";

interface SpotCardProps {
  spot: Spot;
  compact?: boolean;
  /** Set to true for above-the-fold images (first 6 cards) */
  priority?: boolean;
}

function inferSpotCity(spot: Spot): string | null {
  return inferSpotContextCity({
    name: spot.name,
    address: spot.location.address,
    lat: spot.location.lat,
    lng: spot.location.lng,
  });
}

function getInitialImage(spot: Spot) {
  const realPhoto = getFirstRealDisplaySpotPhoto(spot.photos);
  if (realPhoto) return { src: realPhoto, isAreaFallback: false };

  const fallback =
    getCityFallbackImage(spot) ?? spot.photos[0] ?? PLACEHOLDER_IMAGE;
  return { src: fallback, isAreaFallback: true };
}

function getCityFallbackImage(spot: Spot) {
  const city = inferSpotCity(spot);
  if (!city) return null;

  return getSpotFallbackImageUrl({
    name: spot.name,
    category: spot.category,
    city,
    address: spot.location.address,
    width: 1200,
    height: 900,
    quality: 90,
  });
}

function hasRealSpotPhoto(spot: Spot) {
  return spot.hasRealPhoto ?? hasRealDisplaySpotPhoto(spot.photos);
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

function LocalCrowdChip({
  percentage,
  className,
}: {
  percentage: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-0 max-w-full shrink-0 items-center gap-1 overflow-hidden rounded-md border border-emerald-200/15 bg-emerald-400/10 px-1.5 text-[10px] font-semibold leading-none text-emerald-100 sm:h-7 sm:rounded-full sm:px-2 sm:text-[11px]",
        className,
      )}
      title={`${percentage}% local crowd signal`}
    >
      <Users className="h-3 w-3" aria-hidden="true" />
      {percentage}%
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
          ? "Place"
          : confidence.tone === "exact"
            ? "Exact"
            : confidence.tone === "pinned"
              ? "Pinned"
              : "Area"}
      </span>
    </span>
  );
}

function AreaImageChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-md border border-violet-100/20 bg-black/60 px-1 py-0.5 text-[9px] font-medium leading-none text-violet-50/85 shadow-lg shadow-black/15 backdrop-blur min-[360px]:gap-1 min-[360px]:rounded-full min-[360px]:px-1.5 min-[360px]:text-[10px]",
        className,
      )}
      title="Area image shown until a real spot photo is available"
    >
      <ImageIcon
        className="h-2.5 w-2.5 flex-shrink-0 min-[360px]:h-3 min-[360px]:w-3"
        aria-hidden="true"
      />
      <span className="truncate min-[430px]:hidden">Area</span>
      <span className="hidden truncate min-[430px]:inline">Area image</span>
    </span>
  );
}

function TrendingChip({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-0 max-w-full shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-rose-200/25 bg-rose-400/10 px-1.5 text-[10px] font-semibold leading-none text-rose-100",
        className,
      )}
      title="Trending"
    >
      <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
      {showLabel && <span className="truncate">Hot</span>}
      <span className="sr-only">Trending</span>
    </span>
  );
}

function CategoryTrendRow({
  category,
  trending,
  compact = false,
  className,
}: {
  category: string;
  trending?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 max-w-full items-center gap-1 overflow-hidden",
        trending ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1",
        className,
      )}
    >
      <span
        className={cn(
          "min-w-0 max-w-full truncate rounded-md border border-violet-200/20 bg-violet-400/10 font-medium leading-none text-violet-100",
          compact
            ? "h-5 px-1.5 py-0.5 text-[9px] min-[390px]:px-2 min-[390px]:text-[10px]"
            : "px-1.5 py-1 text-[10px] sm:rounded-full sm:px-2.5 sm:text-[11px]",
        )}
        title={category}
      >
        {category}
      </span>
      {trending && (
        <TrendingChip
          className={cn(
            "justify-self-end",
            compact ? "h-5 w-6 px-0.5" : "max-w-[4.5rem]",
          )}
          showLabel={!compact}
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
  const initialImage = getInitialImage(spot);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [usingAreaImage, setUsingAreaImage] = useState(
    initialImage.isAreaFallback,
  );
  const [showGradientFallback, setShowGradientFallback] = useState(false);
  const hasRealPhoto = hasRealSpotPhoto(spot);
  const inferredCity = inferSpotCity(spot);
  const cityFallbackImage = getCityFallbackImage(spot);
  const [imageSrc, setImageSrc] = useState(
    addFallbackToPlacePhotoUrl(initialImage.src, cityFallbackImage),
  );
  const fallbackLabel = inferredCity ? `${inferredCity} area` : spot.category;
  const fallbackGradient = getCityGradient(fallbackLabel);

  const handleImageError = () => {
    const cityFallback = cityFallbackImage;
    if (cityFallback && imageSrc !== cityFallback) {
      setImageSrc(cityFallback);
      setUsingAreaImage(true);
      setImageLoaded(false);
      return;
    }

    setShowGradientFallback(true);
    setUsingAreaImage(true);
    setImageLoaded(true);
  };

  const renderImage = (sizes: string) => {
    if (showGradientFallback) {
      return (
        <div
          className={cn(
            "flex h-full w-full items-end bg-gradient-to-br p-2",
            fallbackGradient,
          )}
        >
          <span className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            {fallbackLabel}
          </span>
        </div>
      );
    }

    return (
      <Image
        src={imageSrc}
        alt={spot.name}
        fill
        sizes={sizes}
        quality={90}
        priority={priority}
        className={cn(
          "object-cover transition-all duration-500 ease-out",
          "group-hover:scale-110",
          imageLoaded ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setImageLoaded(true)}
        onError={handleImageError}
      />
    );
  };

  if (compact) {
    // Premium compact horizontal card for list view
    return (
      <Card
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
        <Link
          href={`/spots/${spot.id}`}
          aria-label={`Open ${spot.name}`}
          className="relative aspect-[4/3] w-[4rem] flex-shrink-0 overflow-hidden bg-violet-950/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0714] min-[380px]:w-20 min-[430px]:w-24 sm:w-32 md:w-36"
        >
          {!showGradientFallback && !imageLoaded && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-violet-950 via-violet-900/80 to-violet-950" />
          )}
          {renderImage("(max-width: 640px) 112px, 160px")}
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
          {(!hasRealPhoto || usingAreaImage) && (
            <AreaImageChip className="absolute bottom-1.5 left-1.5 z-10" />
          )}
        </Link>

        <div className="relative flex min-w-0 flex-1 flex-col p-1.5 min-[380px]:p-2 sm:p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/spots/${spot.id}`}
                className="block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100b1c]"
              >
                <h3 className="line-clamp-1 text-sm font-semibold leading-tight text-white transition-colors duration-200 group-hover:text-violet-100 sm:text-base">
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
                size="sm"
                className="h-7 w-7 bg-white/10 p-0 hover:bg-white/20 [&_svg]:h-3.5 [&_svg]:w-3.5"
              />
            </div>
          </div>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-violet-50/60 sm:mt-1.5 sm:line-clamp-2 sm:text-sm">
            {spot.description}
          </p>
          <div className="mt-auto min-w-0 border-t border-white/10 pt-1.5 text-xs text-violet-50/60 sm:pt-2">
            <div className="mb-1.5 min-w-0">
              <CategoryTrendRow
                category={spot.category}
                trending={spot.trending}
                compact
              />
            </div>
            <div
              data-spot-card-meta
              className="grid min-w-0 grid-cols-[minmax(0,max-content)_minmax(0,max-content)_1fr] items-center gap-1 overflow-hidden"
            >
              <SpotScoreChip score={spot.localleyScore} className="max-w-full" />
              <LocalCrowdChip
                percentage={spot.localPercentage}
                className="hidden min-[430px]:inline-flex"
              />
              <LocationConfidenceChip
                spot={spot}
                className="hidden min-[640px]:inline-flex sm:inline-flex"
              />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Premium grid card with glassmorphism and micro-animations
  return (
    <Card
      data-spot-card="grid"
      className={cn(
        "group relative flex min-h-[4.9rem] flex-row items-stretch overflow-hidden rounded-lg !gap-0 !py-0 md:min-h-0 md:flex-col",
        "bg-[#100b1c]/92 text-white backdrop-blur-xl",
        "border border-violet-200/15",
        "transition-all duration-300 ease-out",
        "shadow-md shadow-violet-950/20",
        "hover:shadow-xl hover:shadow-violet-500/20",
        "hover:border-violet-300/45",
        "hover:-translate-y-0.5",
      )}
    >
      <Link
        href={`/spots/${spot.id}`}
        aria-label={`Open ${spot.name}`}
        className="relative w-[4.5rem] shrink-0 overflow-hidden bg-violet-950/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0714] min-[380px]:w-20 min-[460px]:w-24 md:aspect-[2/1] md:w-full"
      >
        {!showGradientFallback && !imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-violet-900/80 to-violet-950">
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
              style={{ backgroundSize: "200% 100%" }}
            />
          </div>
        )}

        {renderImage(
          "(max-width: 640px) 128px, (max-width: 1024px) 50vw, 33vw",
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/12 to-black/10 transition-opacity duration-300 group-hover:opacity-85" />

        {(!hasRealPhoto || usingAreaImage) && (
          <AreaImageChip className="absolute bottom-1.5 left-1.5 z-10 md:bottom-2.5 md:left-2.5 md:max-w-[calc(100%-5.5rem)] md:px-2.5 md:py-1 md:text-[11px]" />
        )}
      </Link>
      <div className="absolute right-1.5 top-1.5 z-20 hidden md:right-2.5 md:top-2.5 md:block">
        <div className="flex-shrink-0 rounded-full border border-white/20 bg-black/42 p-1 shadow-lg shadow-black/15 backdrop-blur-md transition-all duration-300 hover:scale-105 md:opacity-0 md:group-hover:opacity-100">
          <SaveSpotButton
            spotId={spot.id}
            className="h-7 w-7 bg-white/90 p-0 text-slate-900 hover:bg-white md:h-8 md:w-8"
          />
        </div>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col p-1.5 min-[380px]:p-2 sm:p-2.5">
        <div className="mb-1.5 hidden min-w-0 md:block">
          <div className="min-w-0">
            <CategoryTrendRow
              category={spot.category}
              trending={spot.trending}
            />
          </div>
        </div>

        <div className="mb-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 md:mb-0 md:block">
          <Link
            href={`/spots/${spot.id}`}
            className="block min-w-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100b1c]"
          >
            <h3 className="line-clamp-1 text-sm font-semibold leading-snug text-white transition-colors duration-200 group-hover:text-violet-100 sm:text-[15px]">
              {spot.name}
            </h3>
          </Link>
          <div className="relative z-20 shrink-0 md:hidden">
            <SaveSpotButton
              spotId={spot.id}
              className="h-7 w-7 bg-white/10 p-0 text-white hover:bg-white/20 [&_svg]:h-3.5 [&_svg]:w-3.5"
            />
          </div>
        </div>

        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-violet-50/55 md:mt-1">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-violet-300" />
          <span className="truncate">{spot.location.address}</span>
        </p>

        <div className="mt-auto min-w-0 border-t border-white/10 pt-1.5">
          <div
            data-spot-card-meta
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(3.75rem,auto)] items-center gap-1 overflow-hidden md:flex md:flex-wrap md:overflow-visible"
          >
            <CategoryTrendRow
              category={spot.category}
              trending={spot.trending}
              compact
              className="md:hidden"
            />
            <SpotScoreChip score={spot.localleyScore} showLabel className="justify-self-end md:justify-self-auto" />
            <LocalCrowdChip
              percentage={spot.localPercentage}
              className="hidden md:inline-flex"
            />
            <LocationConfidenceChip
              spot={spot}
              className="hidden lg:inline-flex"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
