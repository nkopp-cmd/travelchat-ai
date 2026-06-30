"use client";

import { useCallback, useEffect, useState } from "react";
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
  const { data, setData, setCanProceed, goToStep } = useWizard();
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
  const handleSelectCity = useCallback(
    (cityName: string) => {
      setData({ city: cityName });

      if (data.templateName) {
        window.setTimeout(() => goToStep(3), 120);
      }
    },
    [data.templateName, goToStep, setData]
  );

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="flex min-h-full flex-col px-4 py-3 pb-6 sm:py-5">
      {/* Header */}
      <div className="mb-3 text-center sm:mb-5">
        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-600/20 sm:mb-3 sm:h-14 sm:w-14">
          <MapPin className="h-5 w-5 text-violet-400 sm:h-7 sm:w-7" />
        </div>
        <h2 className="mb-1.5 text-xl font-bold text-white sm:mb-2 sm:text-2xl">Where to?</h2>
        <p className="text-sm text-gray-400 sm:text-base">
          {data.templateName ? "Pick a city and tune the final details" : "Pick a city to explore like a local"}
        </p>
      </div>

      {/* Unified City Grid */}
      {cities.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
          {cities.map((city) => (
            <CityCard
              key={city.slug}
              city={city}
              isSelected={data.city === city.name}
              onSelect={() => handleSelectCity(city.name)}
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
}: {
  city: CityOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative rounded-lg overflow-hidden transition-all aspect-[1.7/1] sm:aspect-[3/2] sm:rounded-xl",
        "group focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-black",
        isSelected && "ring-2 ring-violet-500"
      )}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
        style={{
          backgroundImage: city.heroImage ? `url(${city.heroImage})` : undefined,
          backgroundColor: "#374151"
        }}
      />

      {/* Gradient overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent",
          isSelected && "from-violet-900/80 via-violet-900/30"
        )}
      />

      {/* Status badge */}
      {city.status === "recommended" && (
        <div className="absolute top-1.5 left-1.5 rounded-full bg-violet-600/90 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm sm:top-2 sm:left-2 sm:px-2 sm:text-[10px]">
          Popular
        </div>
      )}
      {city.status === "beta" && (
        <div className="absolute top-1.5 left-1.5 rounded-full border border-white/10 bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold text-white/80 backdrop-blur-sm sm:top-2 sm:left-2 sm:px-2 sm:text-[10px]">
          Beta
        </div>
      )}

      {/* Selected checkmark */}
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 sm:top-2 sm:right-2 sm:h-7 sm:w-7">
          <Check className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4" />
        </div>
      )}

      {/* City info */}
      <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3">
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="text-base sm:text-lg">{city.emoji}</span>
          <span className="font-bold text-white text-sm leading-tight">{city.name}</span>
        </div>
        {city.vibe && (
          <p className="line-clamp-1 text-[10px] leading-tight text-gray-300 sm:text-[11px]">{city.vibe}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-0.5">{city.spotCount} spots</p>
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Skeleton key={i} className="aspect-[3/2] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
