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

    // Debounce search input - 300ms delay
    const debouncedSearch = useDebouncedCallback((value: string) => {
        onFilterChange("search", value || null);
    }, 300);

    // Sync search value when filters change externally (e.g., clear all)
    useEffect(() => {
        setSearchValue(currentFilters.search || "");
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

    return (
        <div className="mb-6 space-y-4 p-4 rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-md border border-black/5 dark:border-white/10">
            {/* Search Bar */}
            <div className="relative flex-1">
                <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    placeholder="Search spots, neighborhoods, or cuisines..."
                    value={searchValue}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-10 h-11 bg-white/50 dark:bg-white/5 border-black/5 dark:border-white/10"
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
                className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
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
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                                isActive
                                    ? `${filter.color} ring-2 ring-offset-1 ring-current`
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                            )}
                            aria-pressed={isActive}
                        >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {filter.label}
                        </button>
                    );
                })}
            </div>

            {/* Advanced Filters Row */}
            <div
                className="flex flex-wrap gap-3 items-center"
                role="group"
                aria-label="Filter options"
            >
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Filter className="h-4 w-4" aria-hidden="true" />
                    Filters:
                </div>

                {/* City Filter */}
                <Select
                    value={currentFilters.city || "all"}
                    onValueChange={(v) => onFilterChange("city", v === "all" ? null : v)}
                >
                    <SelectTrigger className="w-[160px]" aria-label="Select city">
                        <MapPin className="h-4 w-4 mr-2" aria-hidden="true" />
                        <SelectValue placeholder="All Cities" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Cities</SelectItem>
                        {filterOptions.cities.map((city) => (
                            <SelectItem key={city.slug} value={city.slug}>
                                <div className="flex items-center justify-between w-full">
                                    <span>
                                        {city.emoji} {city.name}
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
                    <SelectTrigger className="w-[160px]" aria-label="Select category">
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
                    <SelectTrigger className="w-[180px]" aria-label="Select Localley score">
                        <Star className="h-4 w-4 mr-2" aria-hidden="true" />
                        <SelectValue placeholder="Localley Score" />
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
                    <SelectTrigger className="w-[160px]" aria-label="Sort by">
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
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4 mr-1" aria-hidden="true" />
                        Clear
                    </Button>
                )}
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2" role="list" aria-label="Active filters">
                    {currentFilters.search && (
                        <Badge variant="secondary" className="gap-1">
                            Search: &quot;{currentFilters.search}&quot;
                            <button
                                onClick={() => onFilterChange("search", null)}
                                aria-label="Remove search filter"
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {currentFilters.city && (
                        <Badge variant="secondary" className="gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {filterOptions.cities.find((c) => c.slug === currentFilters.city)?.name}
                            <button
                                onClick={() => onFilterChange("city", null)}
                                aria-label="Remove city filter"
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {currentFilters.category && (
                        <Badge variant="secondary" className="gap-1">
                            {currentFilters.category}
                            <button
                                onClick={() => onFilterChange("category", null)}
                                aria-label="Remove category filter"
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    )}
                    {currentFilters.score && (
                        <Badge variant="secondary" className="gap-1">
                            <Star className="h-3 w-3" aria-hidden="true" />
                            Score: {currentFilters.score}
                            <button
                                onClick={() => onFilterChange("score", null)}
                                aria-label="Remove score filter"
                                className="ml-1 hover:bg-muted rounded-full p-0.5"
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
