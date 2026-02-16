"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { CityOption } from "@/lib/spots/types";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CityQuickFiltersProps {
    cities: CityOption[];
    totalSpots: number;
}

/**
 * Clickable city badges that filter the spots list
 * Updates URL params when clicked for shareable filter state
 */
export function CityQuickFilters({ cities, totalSpots }: CityQuickFiltersProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const currentCity = searchParams.get("city");

    const handleCityClick = (citySlug: string | null) => {
        const params = new URLSearchParams(searchParams.toString());

        if (citySlug === currentCity) {
            // Clicking same city clears the filter
            params.delete("city");
        } else if (citySlug) {
            params.set("city", citySlug);
        } else {
            params.delete("city");
        }

        // Reset to page 1 when changing city filter
        params.delete("page");

        startTransition(() => {
            const queryString = params.toString();
            router.push(queryString ? `${pathname}?${queryString}` : pathname, {
                scroll: false,
            });
        });
    };

    return (
        <div className="flex flex-wrap items-center gap-3">
            {cities.map((city) => {
                const isActive = currentCity === city.slug;

                return (
                    <button
                        key={city.slug}
                        onClick={() => handleCityClick(city.slug)}
                        disabled={isPending}
                        className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 rounded-full"
                    >
                        <Badge
                            variant={isActive ? "default" : "secondary"}
                            className={cn(
                                "px-3 py-1.5 text-sm cursor-pointer transition-all duration-200",
                                isActive
                                    ? "bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-500/20"
                                    : "bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-black/5 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/30 hover:bg-violet-50 dark:hover:bg-violet-900/20",
                                isPending && "opacity-60"
                            )}
                        >
                            <span className="mr-1.5">{city.emoji}</span>
                            <span className="font-medium">{city.name}</span>
                            <span
                                className={cn(
                                    "ml-1.5 text-xs",
                                    isActive
                                        ? "text-violet-200"
                                        : "text-muted-foreground"
                                )}
                            >
                                {city.count} spots
                            </span>
                        </Badge>
                    </button>
                );
            })}

            {/* Total spots indicator */}
            <Badge
                variant="outline"
                className="px-3 py-1.5 text-sm border-dashed bg-white/50 dark:bg-white/5 backdrop-blur-sm"
            >
                {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 text-violet-500 animate-spin" />
                ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5 text-violet-500" />
                )}
                {totalSpots} total curated spots
            </Badge>
        </div>
    );
}
