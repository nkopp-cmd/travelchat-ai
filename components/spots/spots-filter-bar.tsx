"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
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
  ChevronDown,
} from "@/components/ui/icons";
import {
  SpotsFilterState,
  FilterOptions,
  SORT_OPTIONS,
} from "@/lib/spots/types";
import { cn } from "@/lib/utils";
import { useDebouncedCallback } from "use-debounce";

// Quick filter chips with icons
const QUICK_FILTERS = [
  {
    id: "trending",
    label: "Trending",
    icon: Flame,
    color: "bg-raised text-foreground hover:bg-overlay",
  },
  {
    id: "Food",
    label: "Food",
    icon: Utensils,
    color: "bg-raised text-foreground hover:bg-overlay",
  },
  {
    id: "Cafe",
    label: "Cafes",
    icon: Coffee,
    color: "bg-raised text-foreground hover:bg-overlay",
  },
  {
    id: "Nightlife",
    label: "Nightlife",
    icon: Moon,
    color: "bg-raised text-foreground hover:bg-overlay",
  },
  {
    id: "Shopping",
    label: "Shopping",
    icon: ShoppingBag,
    color: "bg-raised text-foreground hover:bg-overlay",
  },
  {
    id: "Outdoor",
    label: "Outdoor",
    icon: Trees,
    color: "bg-raised text-foreground hover:bg-overlay",
  },
  {
    id: "Market",
    label: "Markets",
    icon: Store,
    color: "bg-raised text-foreground hover:bg-overlay",
  },
];

const FILTER_TRIGGER_CLASS =
  "h-10 w-full min-w-0 max-w-full appearance-none overflow-hidden truncate rounded-md bg-raised py-0 pr-8 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm";

function FilterSelect({ label, value, onChange, options, icon, testId }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; icon?: ReactNode; testId?: string;
}) {
  return (
    <div className="relative min-w-0 text-foreground">
      {icon && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 sm:left-3">{icon}</span>}
      <select aria-label={label} data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)}
        className={cn(FILTER_TRIGGER_CLASS, icon ? "pl-7 sm:pl-9" : "pl-2 sm:pl-3")}>
        {options.map((option) => <option key={option.value} value={option.value} className="bg-surface text-foreground">{option.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" aria-hidden="true" />
    </div>
  );
}

interface SpotsFilterBarProps {
  filterOptions: FilterOptions;
  currentFilters: SpotsFilterState;
  onFilterChange: (
    key: keyof SpotsFilterState,
    value: string | number | null,
  ) => void;
  onClearFilters: () => void;
  isPending: boolean;
  /** The bar floats over the phone/tablet map: start collapsed and keep the toggle up to lg, so the map stays visible. */
  overMap?: boolean;
}

export function SpotsFilterBar({
  filterOptions,
  currentFilters,
  onFilterChange,
  onClearFilters,
  isPending,
  overMap = false,
}: SpotsFilterBarProps) {
  const [searchValue, setSearchValue] = useState(currentFilters.search || "");
  const [showMobileFilters, setShowMobileFilters] = useState(
    !overMap && Boolean(
      currentFilters.city ||
        currentFilters.category ||
        currentFilters.score ||
        currentFilters.sortBy !== "score",
    ),
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
    [debouncedSearch],
  );

  const handleQuickFilter = useCallback(
    (filterId: string) => {
      if (filterId === "trending") {
        // Toggle trending sort
        onFilterChange(
          "sortBy",
          currentFilters.sortBy === "trending" ? "score" : "trending",
        );
      } else {
        // Toggle category
        onFilterChange(
          "category",
          currentFilters.category === filterId ? null : filterId,
        );
      }
    },
    [currentFilters, onFilterChange],
  );

  const hasActiveFilters =
    currentFilters.city ||
    currentFilters.category ||
    currentFilters.score ||
    currentFilters.search ||
    currentFilters.sortBy !== "score";

  const advancedFilterCount = [
    currentFilters.city,
    currentFilters.category,
    currentFilters.score,
    currentFilters.sortBy !== "score" ? currentFilters.sortBy : null,
  ].filter(Boolean).length;

  const getScoreOptionLabel = (score: {
    value: number;
    label: string;
    count: number;
  }) =>
    `${score.value}+ ${score.label.replace("Legendary Alley", "Legendary").replace("Local Favorite", "Local fave")} (${score.count})`;

  const getSortOptionLabel = (label: string) =>
    label
      .replace("Highest Score", "Top score")
      .replace("Most Local", "Most local");
  const activeSortLabel =
    SORT_OPTIONS.find((option) => option.value === currentFilters.sortBy)
      ?.label || currentFilters.sortBy;

  return (
    <div className="mb-4 space-y-3 rounded-lg bg-surface p-2.5 text-foreground backdrop-blur-xl sm:mb-5 sm:space-y-4 sm:p-4">
      {/* Search Bar */}
      <div className="relative flex-1">
        <Search
          className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-field-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder="Search spots or areas"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-10 min-w-0 pl-10 pr-10 text-sm focus-visible:ring-ring sm:h-11 sm:text-base"
          aria-label="Search spots"
        />
        {isPending && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-field-foreground"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Quick Filter Chips */}
      <div
        className="-mx-2.5 flex gap-1.5 overflow-x-auto px-2.5 pb-1.5 scrollbar-hide sm:mx-0 sm:flex-wrap sm:gap-2 sm:px-0 sm:pb-0"
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
                "flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-all sm:min-h-9 sm:px-3 sm:py-1.5 sm:text-sm",
                isActive
                  ? " bg-primary text-primary-foreground"
                  : " bg-raised text-foreground hover:bg-overlay",
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
          "grid min-w-0 items-center gap-2",
          overMap ? "lg:hidden" : "md:hidden",
          hasActiveFilters
            ? "grid-cols-[minmax(0,1fr)_2.25rem]"
            : "grid-cols-1",
        )}
        data-testid="spots-mobile-filter-row"
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowMobileFilters((value) => !value)}
          className="h-9 w-full min-w-0 max-w-full justify-center overflow-hidden rounded-full bg-raised px-3 text-xs text-foreground hover:bg-overlay"
          aria-expanded={showMobileFilters}
          aria-controls="spots-advanced-filters"
          data-testid="spots-mobile-filter-toggle"
        >
          <span className="inline-flex min-w-0 max-w-full items-center justify-center gap-1.5 overflow-hidden">
            <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {advancedFilterCount > 0 ? "Edit filters" : "Filters"}
            </span>
          </span>
          {advancedFilterCount > 0 && (
            <span className="ml-1.5 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-primary-foreground">
              {advancedFilterCount}
            </span>
          )}
        </Button>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClearFilters}
            className="h-9 w-9 shrink-0 justify-self-end rounded-full bg-raised p-0 text-foreground hover:bg-overlay"
            data-testid="spots-mobile-clear-filters"
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
          "grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:items-center xl:grid-cols-4",
          !showMobileFilters && (overMap ? "hidden lg:grid" : "hidden md:grid"),
        )}
        role="group"
        aria-label="Filter options"
        data-testid="spots-advanced-filters"
      >
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground sm:col-span-2 xl:hidden">
          <Filter className="h-4 w-4" aria-hidden="true" />
          More filters
        </div>

        {/* Native selects: the phone's own picker, no popup library in the /spots bundle. */}
        <FilterSelect
          label="Select city"
          icon={<MapPin className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />}
          value={currentFilters.city || "all"}
          onChange={(v) => onFilterChange("city", v === "all" ? null : v)}
          options={[
            { value: "all", label: "All Cities" },
            ...filterOptions.cities.map((city) => ({ value: city.slug, label: `${city.name} (${city.count})` })),
          ]}
        />
        <FilterSelect
          label="Select category"
          value={currentFilters.category || "all"}
          onChange={(v) => onFilterChange("category", v === "all" ? null : v)}
          options={[
            { value: "all", label: "All Categories" },
            ...filterOptions.categories.map((cat) => ({ value: cat.name, label: `${cat.name} (${cat.count})` })),
          ]}
        />
        <FilterSelect
          label="Select Localley score"
          testId="spots-score-filter-trigger"
          icon={<Star className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />}
          value={currentFilters.score?.toString() || "all"}
          onChange={(v) => onFilterChange("score", v === "all" ? null : parseInt(v))}
          options={[
            { value: "all", label: "All Scores" },
            ...filterOptions.scores.map((score) => ({ value: score.value.toString(), label: getScoreOptionLabel(score) })),
          ]}
        />
        <FilterSelect
          label="Sort by"
          value={currentFilters.sortBy}
          onChange={(v) => onFilterChange("sortBy", v)}
          options={SORT_OPTIONS.map((option) => ({ value: option.value, label: getSortOptionLabel(option.label) }))}
        />

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="hidden h-10 w-full shrink-0 rounded-lg bg-raised text-foreground hover:bg-overlay sm:col-span-2 md:inline-flex xl:col-span-4"
          >
            <X className="mr-1 h-4 w-4" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div
          className="flex min-w-0 flex-wrap gap-2 overflow-hidden"
          role="list"
          aria-label="Active filters"
        >
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
                {
                  filterOptions.cities.find(
                    (c) => c.slug === currentFilters.city,
                  )?.name
                }
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
              <span className="max-w-[11rem] truncate">
                {currentFilters.category}
              </span>
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
          {currentFilters.sortBy !== "score" && (
            <Badge variant="secondary" className="max-w-full gap-1">
              <Filter className="h-3 w-3" aria-hidden="true" />
              <span className="max-w-[11rem] truncate">
                Sort: {getSortOptionLabel(activeSortLabel)}
              </span>
              <button
                onClick={() => onFilterChange("sortBy", "score")}
                aria-label="Reset sort filter"
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
