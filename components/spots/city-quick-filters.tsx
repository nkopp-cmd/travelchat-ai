"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
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
                        aria-pressed={isActive}
                        onClick={() => handleCityClick(city.slug)}
                        disabled={isPending}
                        className="city-chip-btn group"
                    >
                        <span
                            className={cn(
                                "city-chip",
                                isActive ? "city-chip-on" : "city-chip-off",
                                isPending && "opacity-60"
                            )}
                        >
                            <CityImageAvatar city={city.name} className="h-6 w-6 rounded-full " sizes="24px" />
                            <span className="min-w-0 break-words font-medium">{city.name}</span>{" "}
                            <span
                                className={cn(
                                    "ml-1.5 text-xs",
                                    isActive
                                        ? "text-violet-100"
                                        : "text-violet-50/70"
                                )}
                            >
                                {city.count.toLocaleString("en-US")} spots
                            </span>
                        </span>
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
