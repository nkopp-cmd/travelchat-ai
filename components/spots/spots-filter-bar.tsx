"use client";

import { useState, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Search,
    Filter,
    X,
    MapPin,
    Star,
    Utensils,
    Coffee,
    Moon,
    ShoppingBag,
    Trees,
    Store,
    Flame,
    Loader2,
} from "lucide-react";
import { SpotsFilterState, FilterOptions, SORT_OPTIONS } from "@/lib/spots/types";
import { cn } from "@/lib/utils";
import { CityImageAvatar } from "@/components/ui/city-image";
import { useDebouncedCallback } from "use-debounce";

// Quick filter chips with icons
const QUICK_FILTERS = [
    {
        id: "trending",
        label: "Trending",
        icon: Flame,
        color: "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400",
    },
    {
        id: "Food",
        label: "Food",
        icon: Utensils,
        color: "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
    },
    {
        id: "Cafe",
        label: "Cafes",
        icon: Coffee,
        color: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
    },
    {
        id: "Nightlife",
        label: "Nightlife",
        icon: Moon,
        color: "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400",
    },
    {
        id: "Shopping",
        label: "Shopping",
        icon: ShoppingBag,
        color: "bg-pink-100 text-pink-700 hover:bg-pink-200 dark:bg-pink-900/30 dark:text-pink-400",
    },
    {
        id: "Outdoor",
        label: "Outdoor",
        icon: Trees,
        color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
    },
    {
        id: "Market",
        label: "Markets",
        icon: Store,
        color: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400",
    },
];

interface SpotsFilterBarProps {
    filterOptions: FilterOptions;
    currentFilters: SpotsFilterState;
    onFilterChange: (key: keyof SpotsFilterState, value: string | number | null) => void;
    onClearFilters: () => void;
    isPending: boolean;
}

export function SpotsFilterBar({
    filterOptions,
    currentFilters,
    onFilterChange,
    onClearFilters,
    isPending,
}: SpotsFilterBarProps) {
    const [searchValue, setSearchValue] = useState(currentFilters.search || "");
    const [showMobileFilters, setShowMobileFilters] = useState(
        Boolean(currentFilters.city || currentFilters.category || currentFilters.score)
    );

    // Debounce search input - 300ms delay
    const debouncedSearch = useDebouncedCallback((value: string) => {
        onFilterChange("search", value || null);
    }, 300);

    // Sync search value when filters change externally (e.g., clear all)
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setSearchValue(currentFilters.search || "");
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [currentFilters.search]);

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearchValue(value);
            debouncedSearch(value);
        },
        [debouncedSearch]
    );

    const handleQuickFilter = useCallback(
        (filterId: string) => {
            if (filterId === "trending") {
                // Toggle trending sort
                onFilterChange(
                    "sortBy",
                    currentFilters.sortBy === "trending" ? "score" : "trending"
                );
            } else {
                // Toggle category
                onFilterChange(
                    "category",
                    currentFilters.category === filterId ? null : filterId
                );
            }
        },
        [currentFilters, onFilterChange]
    );

    const hasActiveFilters =
        currentFilters.city ||
        currentFilters.category ||
        currentFilters.score ||
        currentFilters.search;

    const advancedFilterCount = [
        currentFilters.city,
        currentFilters.category,
        currentFilters.score,
        currentFilters.sortBy !== "score" ? currentFilters.sortBy : null,
    ].filter(Boolean).length;

    return (
        <div className="mb-4 space-y-3 rounded-lg border border-violet-200/15 bg-[#100b1c]/86 p-3 text-white shadow-lg shadow-violet-950/20 backdrop-blur-xl sm:mb-5 sm:space-y-4 sm:p-4">
            {/* Search Bar */}
            <div className="relative flex-1">
                <Search
                    className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-100/45"
                    aria-hidden="true"
                />
                <Input
                    placeholder="Search spots, neighborhoods, or cuisines..."
                    value={searchValue}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="h-11 min-w-0 border-white/10 bg-white/[0.06] pl-10 pr-10 text-white placeholder:text-violet-50/35 focus-visible:ring-violet-400"
                    aria-label="Search spots"
                />
                {isPending && (
                    <Loader2
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-violet-500"
                        aria-hidden="true"
                    />
                )}
            </div>

            {/* Quick Filter Chips */}
            <div
                className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1.5 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0"
                role="group"
                aria-label="Quick filters"
            >
                {QUICK_FILTERS.map((filter) => {
                    const Icon = filter.icon;
                    const isActive =
                        filter.id === "trending"
                            ? currentFilters.sortBy === "trending"
                            : currentFilters.category === filter.id;

                    return (
                        <button
                            key={filter.id}
                            onClick={() => handleQuickFilter(filter.id)}
                            className={cn(
                                "flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                                isActive
                                    ? "border-violet-300/50 bg-violet-500 text-white shadow-md shadow-violet-500/20"
                                    : "border-white/10 bg-white/[0.055] text-violet-50/70 hover:border-violet-300/35 hover:bg-violet-400/10 hover:text-white"
                            )}
                            aria-pressed={isActive}
                        >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {filter.label}
                        </button>
                    );
                })}
            </div>

            <div
                className={cn(
                    "grid items-center gap-2 md:hidden",
                    hasActiveFilters ? "grid-cols-[minmax(0,1fr)_2.75rem]" : "grid-cols-1"
                )}
            >
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMobileFilters((value) => !value)}
                    className="h-11 min-w-0 justify-between overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] px-3 text-violet-50/80 hover:bg-white/10 hover:text-white"
                    aria-expanded={showMobileFilters}
                    aria-controls="spots-advanced-filters"
                >
                    <span className="inline-flex min-w-0 items-center gap-2">
                        <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">Filters</span>
                    </span>
                    {advancedFilterCount > 0 && (
                        <span className="ml-2 shrink-0 rounded-full bg-violet-500 px-2 py-0.5 text-xs font-semibold text-white">
                            {advancedFilterCount}
                        </span>
                    )}
                </Button>
                {hasActiveFilters && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClearFilters}
                        className="h-11 w-11 rounded-lg border border-white/10 bg-white/[0.045] p-0 text-violet-50/65 hover:bg-white/10 hover:text-white"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Clear filters</span>
                    </Button>
                )}
            </div>

            {/* Advanced Filters Row */}
            <div
                id="spots-advanced-filters"
                className={cn(
                    "grid grid-cols-1 gap-2 md:grid md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-center",
                    !showMobileFilters && "hidden md:grid"
                )}
                role="group"
                aria-label="Filter options"
            >
                <div className="flex items-center gap-2 text-sm font-medium text-violet-50/65 md:col-span-2 lg:col-span-4 xl:hidden">
                    <Filter className="h-4 w-4" aria-hidden="true" />
                    Filters:
                </div>

                {/* City Filter */}
                <Select
                    value={currentFilters.city || "all"}
                    onValueChange={(v) => onFilterChange("city", v === "all" ? null : v)}
                >
                    <SelectTrigger className="h-10 w-full min-w-0 border-white/10 bg-white/[0.055] px-2 text-xs text-white sm:px-3 sm:text-sm [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate" aria-label="Select city">
                        <MapPin className="mr-1 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                        <SelectValue placeholder="All Cities" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Cities</SelectItem>
                        {filterOptions.cities.map((city) => (
                            <SelectItem key={city.slug} value={city.slug}>
                                <div className="flex items-center justify-between gap-3 w-full">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <CityImageAvatar city={city.name} className="h-6 w-6 rounded-full" sizes="24px" />
                                        <span className="truncate">{city.name}</span>
                                    </span>
                                    <span className="text-muted-foreground text-xs ml-2">
                                        ({city.count})
                                    </span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Category Filter */}
                <Select
                    value={currentFilters.category || "all"}
                    onValueChange={(v) => onFilterChange("category", v === "all" ? null : v)}
                >
                    <SelectTrigger className="h-10 w-full min-w-0 border-white/10 bg-white/[0.055] px-2 text-xs text-white sm:px-3 sm:text-sm [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate" aria-label="Select category">
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {filterOptions.categories.map((cat) => (
                            <SelectItem key={cat.name} value={cat.name}>
                                {cat.name} ({cat.count})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Score Filter */}
                <Select
                    value={currentFilters.score?.toString() || "all"}
                    onValueChange={(v) =>
                        onFilterChange("score", v === "all" ? null : parseInt(v))
                    }
                >
                    <SelectTrigger className="h-10 w-full min-w-0 border-white/10 bg-white/[0.055] px-2 text-xs text-white sm:px-3 sm:text-sm [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate" aria-label="Select Localley score">
                        <Star className="mr-1 h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                        <SelectValue placeholder="Score" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Scores</SelectItem>
                        {filterOptions.scores.map((score) => (
                            <SelectItem key={score.value} value={score.value.toString()}>
                                {score.value} - {score.label} ({score.count})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Sort */}
                <Select
                    value={currentFilters.sortBy}
                    onValueChange={(v) => onFilterChange("sortBy", v)}
                >
                    <SelectTrigger className="h-10 w-full min-w-0 border-white/10 bg-white/[0.055] px-2 text-xs text-white sm:px-3 sm:text-sm [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate" aria-label="Sort by">
                        <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                        {SORT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Clear Filters */}
                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearFilters}
                        className="hidden h-10 w-full text-violet-50/65 hover:bg-white/10 hover:text-white md:inline-flex md:col-span-2 lg:col-span-4 xl:col-span-1 xl:w-auto"
                    >
                        <X className="mr-1 h-4 w-4" aria-hidden="true" />
                        Clear
                    </Button>
                )}
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2" role="list" aria-label="Active filters">
                    {currentFilters.search && (
                        <Badge variant="secondary" className="max-w-full gap-1">
                            <span className="max-w-[15rem] truncate sm:max-w-[22rem]">
                                Search: &quot;{currentFilters.search}&quot;
                            </span>
                            <button
                                onClick={() => onFilterChange("search", null)}
                                aria-label="Remove search filter"
                                className="ml-1 flex-shrink-0 rounded-full p-0.5 hover:bg-muted"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {currentFilters.city && (
                        <Badge variant="secondary" className="max-w-full gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            <span className="max-w-[11rem] truncate">
                                {filterOptions.cities.find((c) => c.slug === currentFilters.city)?.name}
                            </span>
                            <button
                                onClick={() => onFilterChange("city", null)}
                                aria-label="Remove city filter"
                                className="ml-1 flex-shrink-0 rounded-full p-0.5 hover:bg-muted"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {currentFilters.category && (
                        <Badge variant="secondary" className="max-w-full gap-1">
                            <span className="max-w-[11rem] truncate">{currentFilters.category}</span>
                            <button
                                onClick={() => onFilterChange("category", null)}
                                aria-label="Remove category filter"
                                className="ml-1 flex-shrink-0 rounded-full p-0.5 hover:bg-muted"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {currentFilters.score && (
                        <Badge variant="secondary" className="max-w-full gap-1">
                            <Star className="h-3 w-3" aria-hidden="true" />
                            Score: {currentFilters.score}
                            <button
                                onClick={() => onFilterChange("score", null)}
                                aria-label="Remove score filter"
                                className="ml-1 flex-shrink-0 rounded-full p-0.5 hover:bg-muted"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}
