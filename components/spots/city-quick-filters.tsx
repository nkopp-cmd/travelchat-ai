"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { CityOption } from "@/lib/spots/types";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CityImageAvatar } from "@/components/ui/city-image";

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
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0">
            {cities.map((city) => {
                const isActive = currentCity === city.slug;

                return (
                    <button
                        key={city.slug}
                        onClick={() => handleCityClick(city.slug)}
                        disabled={isPending}
                        className="group shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100b1c]"
                    >
                        <Badge
                            variant={isActive ? "default" : "secondary"}
                            className={cn(
                                "min-h-10 cursor-pointer gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm transition-all duration-200",
                                isActive
                                    ? "border border-violet-300/45 bg-violet-500 text-white shadow-md shadow-violet-500/20 hover:bg-violet-400"
                                    : "border border-violet-200/15 bg-[#100b1c]/78 text-violet-50/75 backdrop-blur-sm hover:border-violet-300/35 hover:bg-violet-400/10 hover:text-white",
                                isPending && "opacity-60"
                            )}
                        >
                            <CityImageAvatar city={city.name} className="h-6 w-6 rounded-full ring-1 ring-white/20" sizes="24px" />
                            <span className="font-medium">{city.name}</span>
                            <span
                                className={cn(
                                    "ml-1.5 text-xs",
                                    isActive
                                        ? "text-violet-200"
                                        : "text-violet-50/45"
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
                className="min-h-10 shrink-0 rounded-full border-dashed border-violet-200/20 bg-[#100b1c]/70 px-3 py-1.5 text-sm text-violet-50/70 backdrop-blur-sm"
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
