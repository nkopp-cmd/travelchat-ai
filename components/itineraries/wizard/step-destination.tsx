"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { useWizard } from "./wizard-context";
import { MapPin, Check, Sparkles, RefreshCw } from "lucide-react";
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

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function StepDestination() {
  const { data, setData, setCanProceed } = useWizard();
  const { data: citiesData, error: citiesError, isLoading, mutate } = useSWR<CitiesResponse>(
    "/api/cities?minSpots=1",
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: true, errorRetryCount: 2 }
  );

  useEffect(() => {
    setCanProceed(!!data.city);
  }, [data.city, setCanProceed]);

  const hasError = citiesError || (citiesData && !citiesData.success);
  const cities = citiesData?.cities || [];
  const recommendedCities = cities.filter(c => c.status === "recommended");
  const availableCities = cities.filter(c => c.status === "available");
  const betaCities = cities.filter(c => c.status === "beta");

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="flex flex-col h-full px-4 py-6 overflow-y-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-violet-600/20 mb-4">
          <MapPin className="w-7 h-7 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Where to?</h2>
        <p className="text-gray-400">Pick a city to explore like a local</p>
      </div>

      {/* Recommended Cities - Large Cards */}
      {recommendedCities.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium text-gray-400">Recommended</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {recommendedCities.map((city) => (
              <CityCard key={city.slug} city={city} isSelected={data.city === city.name} onSelect={() => setData({ city: city.name })} />
            ))}
          </div>
        </div>
      )}

      {/* Available Cities - Medium Cards */}
      {availableCities.length > 0 && (
        <div className="mb-6">
          <span className="text-sm font-medium text-gray-400 mb-3 block">
            More Cities
          </span>
          <div className="grid grid-cols-2 gap-3">
            {availableCities.map((city) => (
              <CityCard key={city.slug} city={city} isSelected={data.city === city.name} onSelect={() => setData({ city: city.name })} compact />
            ))}
          </div>
        </div>
      )}

      {/* Beta Cities - Chips */}
      {betaCities.length > 0 && (
        <div>
          <span className="text-xs text-gray-500 mb-2 block">
            Beta (limited spots)
          </span>
          <div className="flex flex-wrap gap-2">
            {betaCities.map((city) => (
              <CityChip key={city.slug} city={city} isSelected={data.city === city.name} onSelect={() => setData({ city: city.name })} />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="text-center py-8">
          <p className="text-red-400 mb-3">Failed to load cities. Please try again.</p>
          <button
            onClick={() => mutate()}
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
            onClick={() => mutate()}
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
  compact = false
}: {
  city: CityOption;
  isSelected: boolean;
  onSelect: () => void;
  compact?: boolean
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative rounded-2xl overflow-hidden transition-all",
        compact ? "aspect-[3/2]" : "aspect-[4/5]",
        "group focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-black",
        isSelected && "ring-2 ring-violet-500"
      )}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform group-hover:scale-110"
        style={{
          backgroundImage: city.heroImage ? `url(${city.heroImage})` : undefined,
          backgroundColor: "#374151"
        }}
      />

      {/* Gradient overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent",
          isSelected && "from-violet-900/90 via-violet-900/40"
        )}
      />

      {/* Selected checkmark */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
          <Check className="w-5 h-5 text-white" />
        </div>
      )}

      {/* City info */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">{city.emoji}</span>
          <span className={cn("font-bold text-white", compact ? "text-lg" : "text-xl")}>{city.name}</span>
        </div>
        {city.vibe && !compact && <p className="text-sm text-gray-300">{city.vibe}</p>}
        <p className="text-xs text-gray-400 mt-1">{city.spotCount} spots</p>
      </div>
    </button>
  );
}

function CityChip({
  city,
  isSelected,
  onSelect
}: {
  city: CityOption;
  isSelected: boolean;
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-full border transition-all",
        isSelected
          ? "bg-violet-600/20 border-violet-500 text-white"
          : "bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-500"
      )}
    >
      <span>{city.emoji}</span>
      <span className="text-sm font-medium">{city.name}</span>
      <span className="text-xs text-gray-500">{city.spotCount}</span>
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
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
