"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { CityOption } from "@/lib/spots/types";
import { Sparkles, Loader2 } from "@/components/ui/icons";
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
        <div className="space-y-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
            {cities.map((city) => {
                const isActive = currentCity === city.slug;

                return (
                    <button
                        key={city.slug}
                        type="button"
                        aria-label={`${city.name} ${city.count.toLocaleString("en-US")} spots`}
                        aria-pressed={isActive}
                        onClick={() => handleCityClick(city.slug)}
                        disabled={isPending}
                        className="group min-h-11 min-w-11 max-w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#100b1c]"
                    >
                        <Badge
                            variant={isActive ? "default" : "secondary"}
                            className={cn(
                                "min-h-11 max-w-full cursor-pointer flex-wrap gap-2 whitespace-normal rounded-full py-1.5 pl-1.5 pr-3 text-sm transition-all duration-200",
                                isActive
                                    ? " bg-violet-500 text-white shadow-md shadow-violet-500/20 hover:bg-violet-400"
                                    : " bg-[#100b1c]/78 text-violet-50/75 backdrop-blur-sm hover:bg-violet-400/10 hover:text-white",
                                isPending && "opacity-60"
                            )}
                        >
                            <CityImageAvatar city={city.name} className="h-6 w-6 rounded-full " sizes="24px" />
                            <span className="min-w-0 break-words font-medium">{city.name}</span>
                            <span
                                className={cn(
                                    "ml-1.5 text-xs",
                                    isActive
                                        ? "text-violet-200"
                                        : "text-violet-50/45"
                                )}
                            >
                                {city.count.toLocaleString("en-US")} spots
                            </span>
                        </Badge>
                    </button>
                );
            })}
            </div>

            {/* Total spots indicator */}
            <p
                className="flex min-w-0 items-start gap-1.5 text-sm text-violet-50/70"
                role="status"
            >
                {isPending ? (
                    <Loader2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500 animate-spin" />
                ) : (
                    <Sparkles aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                )}
                <span className="min-w-0 break-words">{totalSpots.toLocaleString("en-US")} total curated spots</span>
            </p>
        </div>
    );
}
