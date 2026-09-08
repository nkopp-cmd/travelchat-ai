"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { MapPin, Check, RefreshCw, Route } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MAX_CORRIDOR_DESTINATIONS } from "@/lib/trips/wizard-corridor";
import { selectableSlugs, type CorridorNetwork } from "@/lib/trips/corridor-network";

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
  const [multiCityAvailable, setMultiCityAvailable] = useState(false);
  const [corridorNetwork, setCorridorNetwork] = useState<CorridorNetwork | null>(null);

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
    let cancelled = false;
    fetch("/api/v2/trips/preview", { method: "GET", cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        setMultiCityAvailable(response.ok);
        if (response.ok) {
          const body = await response.json();
          setCorridorNetwork(body.network || null);
        }
      })
      .catch(() => {
        if (!cancelled) setMultiCityAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!citiesData?.cities?.length) return;
    const nameBySlug = Object.fromEntries(
      citiesData.cities.map((city) => [city.slug, city.name]),
    );
    setData({ cityNameBySlug: nameBySlug });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citiesData]);

  useEffect(() => {
    setCanProceed(
      data.tripMode === "multi" ? data.citySlugs.length >= 2 : !!data.city,
    );
  }, [data.city, data.tripMode, data.citySlugs, setCanProceed]);

  const hasError = citiesError || (citiesData && !citiesData.success);
  const cities = citiesData?.cities || [];
  const templateMode = Boolean(data.templateName);
  const multiMode = data.tripMode === "multi" && !templateMode;
  const showModeToggle = multiCityAvailable && !templateMode;

  const handleSelectCity = useCallback(
    (cityName: string) => {
      setData({ city: cityName });
    },
    [setData]
  );

  const handleToggleSlug = useCallback(
    (slug: string) => {
      const current = data.citySlugs;
      if (current.includes(slug)) {
        const remaining = current.filter((value) => value !== slug);
        if (!corridorNetwork) {
          setData({ citySlugs: remaining });
          return;
        }
        const pruned: string[] = [];
        for (const picked of remaining) {
          if (pruned.length === 0 || selectableSlugs(corridorNetwork, pruned).has(picked)) {
            pruned.push(picked);
          }
        }
        setData({ citySlugs: pruned });
      } else if (current.length < MAX_CORRIDOR_DESTINATIONS) {
        if (corridorNetwork && !selectableSlugs(corridorNetwork, current).has(slug)) return;
        setData({ citySlugs: [...current, slug] });
      }
    },
    [data.citySlugs, corridorNetwork, setData]
  );

  const handleModeChange = useCallback(
    (mode: "single" | "multi") => {
      if (mode === data.tripMode) return;
      setData(mode === "multi" ? { tripMode: mode, city: "" } : { tripMode: mode, citySlugs: [] });
    },
    [data.tripMode, setData]
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
          {data.templateName
            ? "Confirm the suggested city or switch it before generating"
            : multiMode
              ? "Pick 2 or more cities — we optimize the route for you"
              : "Pick a city to explore like a local"}
        </p>
      </div>

      {showModeToggle && (
        <div className="mb-3 flex justify-center sm:mb-4">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => handleModeChange("single")}
              aria-pressed={!multiMode}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
                !multiMode ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white",
              )}
            >
              One city
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("multi")}
              aria-pressed={multiMode}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
                multiMode ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white",
              )}
            >
              <Route className="h-3.5 w-3.5" />
              Multi-city
            </button>
          </div>
        </div>
      )}

      {multiMode && data.citySlugs.length > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-violet-300/20 bg-violet-500/10 p-2 text-left shadow-lg shadow-violet-950/15 backdrop-blur sm:mb-3 sm:p-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-500 text-white">
              <Route className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {data.citySlugs.length} {data.citySlugs.length === 1 ? "city" : "cities"} selected
              </p>
              <p className="truncate text-[11px] leading-tight text-violet-100/65">
                {data.citySlugs.length < 2
                  ? "Connected cities in the same country stay available."
                  : data.citySlugs
                      .map((slug) => data.cityNameBySlug[slug] || slug)
                      .join(" · ")}
              </p>
            </div>
          </div>
        </div>
      )}

      {multiMode && data.citySlugs.length === 0 && (
        <p className="mb-2 text-center text-[11px] text-gray-500 sm:mb-3">
          Multi-city currently covers connected cities within Korea and within Japan.
        </p>
      )}

      {data.city && !templateMode && !multiMode && (
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
          {cities.map((city) => {
            const isPicked = multiMode && data.citySlugs.includes(city.slug);
            const enabledSlugs = multiMode && corridorNetwork
              ? selectableSlugs(corridorNetwork, data.citySlugs)
              : null;
            const isDisabled = Boolean(
              multiMode && !isPicked && (!enabledSlugs || !enabledSlugs.has(city.slug)),
            );
            return (
              <CityCard
                key={city.slug}
                city={city}
                isSelected={multiMode ? isPicked : data.city === city.name}
                isDisabled={isDisabled}
                onSelect={() => (multiMode ? handleToggleSlug(city.slug) : handleSelectCity(city.name))}
                compact={templateMode}
              />
            );
          })}
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
  isDisabled = false,
  onSelect,
  compact = false,
}: {
  city: CityOption;
  isSelected: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-pressed={isSelected}
      className={cn(
        "relative overflow-hidden rounded-lg transition-all sm:rounded-xl",
        compact ? "flex min-h-20 flex-col justify-end p-1.5 sm:p-2" : "flex min-h-32 flex-col justify-between gap-2 p-2 sm:min-h-36 sm:p-3",
        "group focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-black",
        isSelected && "ring-2 ring-violet-500",
        isDisabled && "cursor-not-allowed opacity-35 saturate-50"
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

      {/* Keep noncompact badges above the city info, even when text grows. */}
      <div className={compact ? "contents" : "relative flex min-h-6 items-start justify-between gap-1 sm:min-h-7"}>
      {!compact && city.status === "recommended" && (
        <div className={cn(
          "rounded-full bg-violet-600/90 font-semibold text-white backdrop-blur-sm",
          "px-1.5 py-0.5 text-[9px] sm:px-2 sm:text-[10px]"
        )}>
          Popular
        </div>
      )}
      {!compact && city.status === "beta" && (
        <div className={cn(
          "rounded-full border border-white/10 bg-white/15 font-semibold text-white/80 backdrop-blur-sm",
          "px-1.5 py-0.5 text-[9px] sm:px-2 sm:text-[10px]"
        )}>
          Beta
        </div>
      )}

      {/* Selected checkmark */}
      {isSelected && !compact && (
        <div className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-violet-600",
          "ml-auto h-6 w-6 sm:h-7 sm:w-7"
        )}>
          <Check className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4" />
        </div>
      )}
      </div>

      {/* City info */}
      <div className="relative w-full min-w-0">
        <div className={cn("mb-0.5 flex min-w-0 items-center", compact ? "gap-1 sm:gap-1.5" : "gap-1.5")}>
          <span className={cn("shrink-0 leading-none", compact ? "text-sm sm:text-base" : "text-base sm:text-lg")}>{city.emoji}</span>
          <span className={cn("min-w-0 font-bold leading-tight text-white", compact ? "break-words text-left text-xs sm:text-sm" : "truncate text-sm")}>{city.name}</span>
        </div>
        {city.vibe && !compact && (
          <p className="line-clamp-1 text-[10px] leading-tight text-gray-300 sm:text-[11px]">{city.vibe}</p>
        )}
        <div className={cn("flex items-center justify-between gap-1", compact ? "mt-1 flex-wrap" : "mt-0.5")}>
          <p className={cn("min-w-0 truncate text-gray-300/85", compact ? "text-[9px]" : "text-[10px] text-gray-400")}>{city.spotCount} spots</p>
          {isSelected && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              {compact && <Check className="h-3 w-3" aria-hidden="true" />}
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
