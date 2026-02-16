"use client";

import { useEffect } from "react";
import useSWR from "swr";
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

      {/* Unified City Grid */}
      {cities.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {cities.map((city) => (
            <CityCard
              key={city.slug}
              city={city}
              isSelected={data.city === city.name}
              onSelect={() => setData({ city: city.name })}
            />
          ))}
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
}: {
  city: CityOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative rounded-xl overflow-hidden transition-all aspect-[3/2]",
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
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-violet-600/90 text-[10px] font-semibold text-white backdrop-blur-sm">
          Popular
        </div>
      )}
      {city.status === "beta" && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-semibold text-white/80 backdrop-blur-sm border border-white/10">
          Beta
        </div>
      )}

      {/* Selected checkmark */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      {/* City info */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-lg">{city.emoji}</span>
          <span className="font-bold text-white text-sm leading-tight">{city.name}</span>
        </div>
        {city.vibe && (
          <p className="text-[11px] text-gray-300 leading-tight">{city.vibe}</p>
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
