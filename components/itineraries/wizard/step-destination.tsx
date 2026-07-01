"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { MapPin, Check, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CityOption {
  slug: string;
  name: string;
  emoji: string;
  vibe?: string;
  heroImage?: string;
  spotCount: number;
  status: "recommended" | "available" | "beta";
}

interface CitiesResponse {
  success: boolean;
  cities: CityOption[];
  total: number;
}

export function StepDestination() {
  const { data, setData, setCanProceed } = useWizard();
  const [citiesData, setCitiesData] = useState<CitiesResponse | null>(null);
  const [citiesError, setCitiesError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadCities = useCallback(async () => {
    setIsLoading(true);
    setCitiesError(false);

    try {
      const response = await fetch("/api/cities?minSpots=1");
      const result = await response.json();
      setCitiesData(result);
      setCitiesError(!response.ok || !result.success);
    } catch {
      setCitiesError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  useEffect(() => {
    setCanProceed(!!data.city);
  }, [data.city, setCanProceed]);

  const hasError = citiesError || (citiesData && !citiesData.success);
  const cities = citiesData?.cities || [];
  const templateMode = Boolean(data.templateName);
  const handleSelectCity = useCallback(
    (cityName: string) => {
      setData({ city: cityName });
    },
    [setData]
  );

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="flex min-h-full flex-col px-3 py-3 pb-32 sm:px-4 sm:py-5 sm:pb-24">
      {/* Header */}
      <div className={cn("text-center", templateMode ? "mb-2 sm:mb-3" : "mb-3 sm:mb-4")}>
        <div className={cn(
          "mb-2 inline-flex items-center justify-center rounded-full bg-violet-600/20 sm:mb-3",
          templateMode ? "h-9 w-9 sm:h-11 sm:w-11" : "h-10 w-10 sm:h-12 sm:w-12"
        )}>
          <MapPin className="h-5 w-5 text-violet-400 sm:h-6 sm:w-6" />
        </div>
        <h2 className="mb-1 text-xl font-bold text-white sm:mb-2 sm:text-2xl">Where to?</h2>
        <p className="text-sm text-gray-400 sm:text-base">
          {data.templateName ? "Pick a city and tune the final details" : "Pick a city to explore like a local"}
        </p>
      </div>

      {data.city && !templateMode && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-violet-300/20 bg-violet-500/10 p-2 text-left shadow-lg shadow-violet-950/15 backdrop-blur sm:mb-3 sm:p-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500 text-white">
              <Check className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {data.city} selected
              </p>
              <p className="truncate text-[11px] leading-tight text-violet-100/65">
                {templateMode ? "Template settings are ready." : "Continue to trip length."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Unified City Grid */}
      {cities.length > 0 && (
        <div className={cn(
          "grid grid-cols-2 gap-1.5 min-[390px]:grid-cols-3 sm:grid-cols-4 md:gap-2 lg:grid-cols-5",
          templateMode && "min-[360px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        )}>
          {cities.map((city) => (
            <CityCard
              key={city.slug}
              city={city}
              isSelected={data.city === city.name}
              onSelect={() => handleSelectCity(city.name)}
              compact={templateMode}
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="text-center py-8">
          <p className="text-red-400 mb-3">Failed to load cities. Please try again.</p>
          <button
            onClick={loadCities}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}

      {/* Fallback if no cities (but no error) */}
      {cities.length === 0 && !isLoading && !hasError && (
        <div className="text-center text-gray-500 py-8">
          <p className="mb-3">No cities available. Please try again later.</p>
          <button
            onClick={loadCities}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-400 text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}

function CityCard({
  city,
  isSelected,
  onSelect,
  compact = false,
}: {
  city: CityOption;
  isSelected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative overflow-hidden rounded-lg transition-all sm:rounded-xl",
        compact ? "aspect-[2.9/1] sm:aspect-[2.6/1]" : "aspect-[2.18/1] sm:aspect-[2.35/1]",
        "group focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-black",
        isSelected && "ring-2 ring-violet-500"
      )}
    >
      {/* Background image */}
      <div className="absolute inset-0 bg-[#374151]">
        {city.heroImage && (
          <Image
            src={city.heroImage}
            alt={`${city.name} city view`}
            fill
            sizes={
              compact
                ? "(max-width: 479px) 50vw, (max-width: 1024px) 33vw, 25vw"
                : "(max-width: 479px) 50vw, (max-width: 768px) 33vw, 320px"
            }
            quality={90}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </div>

      {/* Gradient overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent",
          isSelected && "from-violet-900/80 via-violet-900/30"
        )}
      />

      {/* Status badge */}
      {!compact && city.status === "recommended" && (
        <div className={cn(
          "absolute rounded-full bg-violet-600/90 font-semibold text-white backdrop-blur-sm",
          "left-1.5 top-1.5 px-1.5 py-0.5 text-[9px] sm:left-2 sm:top-2 sm:px-2 sm:text-[10px]"
        )}>
          Popular
        </div>
      )}
      {!compact && city.status === "beta" && (
        <div className={cn(
          "absolute rounded-full border border-white/10 bg-white/15 font-semibold text-white/80 backdrop-blur-sm",
          "left-1.5 top-1.5 px-1.5 py-0.5 text-[9px] sm:left-2 sm:top-2 sm:px-2 sm:text-[10px]"
        )}>
          Beta
        </div>
      )}

      {/* Selected checkmark */}
      {isSelected && (
        <div className={cn(
          "absolute right-1.5 top-1.5 flex items-center justify-center rounded-full bg-violet-600 sm:right-2 sm:top-2",
          compact ? "h-5 w-5 sm:h-6 sm:w-6" : "h-6 w-6 sm:h-7 sm:w-7"
        )}>
          <Check className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4" />
        </div>
      )}

      {/* City info */}
      <div className={cn("absolute bottom-0 left-0 right-0", compact ? "p-1.5 sm:p-2" : "p-2 sm:p-3")}>
        <div className="mb-0.5 flex min-w-0 items-center gap-1.5">
          <span className={cn("leading-none", compact ? "text-sm sm:text-base" : "text-base sm:text-lg")}>{city.emoji}</span>
          <span className={cn("min-w-0 truncate font-bold leading-tight text-white", compact ? "text-xs sm:text-sm" : "text-sm")}>{city.name}</span>
        </div>
        {city.vibe && !compact && (
          <p className="line-clamp-1 text-[10px] leading-tight text-gray-300 sm:text-[11px]">{city.vibe}</p>
        )}
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <p className={cn("min-w-0 truncate text-gray-300/85", compact ? "text-[9px]" : "text-[10px] text-gray-400")}>{city.spotCount} spots</p>
          {isSelected && (
            <span className="shrink-0 rounded-full bg-violet-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Ready
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full px-4 py-6">
      <div className="text-center mb-8">
        <Skeleton className="w-14 h-14 rounded-full mx-auto mb-4" />
        <Skeleton className="h-8 w-32 mx-auto mb-2" />
        <Skeleton className="h-4 w-48 mx-auto" />
      </div>
      <div className="grid grid-cols-2 gap-1.5 min-[390px]:grid-cols-3 sm:grid-cols-4 md:gap-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <Skeleton key={i} className="aspect-[2.18/1] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
