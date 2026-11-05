"use client";

import { useRef, useCallback, useEffect, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SpotCardEvents } from "@/components/spots/spot-card-events";
import type { ReactNode } from "react";
import { SpotsFilterBar } from "./spots-filter-bar";
import { SpotsPagination } from "./spots-pagination";
import { Spot } from "@/types";
import { SpotsFilterState, FilterOptions } from "@/lib/spots/types";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Grid3X3, List, Map } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const SpotsMap = dynamic(() => import("./spots-map"), {
    ssr: false,
    loading: () => <p role="status" className="py-12 text-center text-muted-foreground">Loading map view...</p>,
});

interface SpotsExplorerProps {
    /** Full spot objects for the map view only; the server sends [] for grid and list (the cards are HTML). */
    initialSpots: Spot[];
    /** Spots on this page (defaults to initialSpots.length). */
    spotCount?: number;
    totalCount: number;
    currentPage: number;
    pageSize: number;
    hasMore: boolean;
    filterOptions: FilterOptions;
    currentFilters: SpotsFilterState;
    /** Server-rendered <SpotCard /> list for the grid and list views (the cards never hydrate). */
    cards: ReactNode;
}

/**
 * Client component for interactive spots exploration
 * Manages filter UI and URL state synchronization
 */
export function SpotsExplorer({
    initialSpots,
    spotCount = initialSpots.length,
    totalCount,
    currentPage,
    pageSize,
    filterOptions,
    currentFilters,
    cards,
}: SpotsExplorerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const requestedView = searchParams.get("view");
    const viewMode = requestedView === "map" || requestedView === "list" ? requestedView : "grid";
    const setViewMode = (view: "grid" | "list" | "map") => {
        const params = new URLSearchParams(searchParams.toString());
        if (view === "grid") params.delete("view");
        else params.set("view", view);
        startTransition(() => {
            router.push(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
        });
    };
    const resultsTopRef = useRef<HTMLDivElement | null>(null);
    const filtersRef = useRef<HTMLDivElement | null>(null);

    const scrollResultsIntoView = useCallback(() => {
        const target = resultsTopRef.current;
        if (!target) return;

        const scrollHost = target.closest<HTMLElement>("[data-main-scroll-host]");
        if (scrollHost instanceof HTMLElement) {
            const targetTop =
                scrollHost.scrollTop +
                target.getBoundingClientRect().top -
                scrollHost.getBoundingClientRect().top;

            scrollHost.scrollTo({
                top: Math.max(targetTop - 16, 0),
                behavior: "smooth",
            });
            return;
        }

        target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    /**
     * Update URL with new filter values
     * Uses startTransition for non-blocking navigation
     */
    const updateFilters = useCallback(
        (updates: Partial<SpotsFilterState>) => {
            const params = new URLSearchParams(searchParams.toString());

            // Update each filter param
            Object.entries(updates).forEach(([key, value]) => {
                if (value === null || value === undefined || value === "" || value === "All") {
                    params.delete(key);
                } else if (key === "page" && value === 1) {
                    params.delete("page");
                } else if (key === "sortBy" && value === "score") {
                    // Don't include default sort in URL
                    params.delete("sort");
                } else if (key === "sortBy") {
                    params.set("sort", String(value));
                } else {
                    params.set(key, String(value));
                }
            });

            // Reset to page 1 when filters change (except for page changes)
            if (!("page" in updates)) {
                params.delete("page");
            }

            startTransition(() => {
                const queryString = params.toString();
                router.push(queryString ? `${pathname}?${queryString}` : pathname, {
                    scroll: false,
                });
            });
        },
        [router, pathname, searchParams]
    );

    /**
     * Handle filter changes from FilterBar
     */
    const handleFilterChange = useCallback(
        (key: keyof SpotsFilterState, value: string | number | null) => {
            updateFilters({ [key]: value });
        },
        [updateFilters]
    );

    /**
     * Handle pagination
     */
    const handlePageChange = useCallback(
        (page: number) => {
            updateFilters({ page });
            window.setTimeout(scrollResultsIntoView, 80);
        },
        [scrollResultsIntoView, updateFilters]
    );

    /**
     * Clear all filters
     */
    const clearFilters = useCallback(() => {
        startTransition(() => {
            router.push(viewMode === "grid" ? pathname : `${pathname}?view=${viewMode}`, { scroll: false });
        });
    }, [router, pathname, viewMode]);

    const hasActiveFilters =
        currentFilters.city ||
        currentFilters.category ||
        currentFilters.score ||
        currentFilters.search;


    const mapOverlay = viewMode === "map" && initialSpots.length > 0;
    const hasSpots = spotCount > 0 || initialSpots.length > 0;
    useMapFiltersHeight(filtersRef, mapOverlay);

    return (
        <>
            <SpotCardEvents />
            {/* Filter Bar: floats over the full-screen phone map, so search and filters stay in reach. */}
            <div ref={filtersRef} data-map-overlay={mapOverlay ? "" : undefined}
                className={cn(mapOverlay && "max-lg:fixed max-lg:inset-x-0 max-lg:top-[var(--ll-topbar-height)] max-lg:z-[41] max-lg:bg-background max-lg:px-3 max-lg:pt-2 max-lg:[&>*]:mb-2")}>
                <SpotsFilterBar
                    overMap={mapOverlay}
                    filterOptions={filterOptions}
                    currentFilters={currentFilters}
                    onFilterChange={handleFilterChange}
                    onClearFilters={clearFilters}
                    isPending={isPending}
                />
            </div>

            {/* Results Header */}
            <div id="spot-results" ref={resultsTopRef} className="mb-4 flex min-w-0 flex-wrap justify-between items-center gap-2 scroll-mt-4 sm:gap-3">
                <div
                    className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
                    aria-live="polite"
                >
                    {isPending && (
                        <Loader2
                            className="h-4 w-4 animate-spin text-violet-500"
                            aria-hidden="true"
                        />
                    )}
                    <span className="min-w-0">
                        {isPending
                            ? "Loading..."
                            : totalCount > 0
                                ? `${totalCount.toLocaleString("en-US")} spots`
                                : "No spots found"}
                    </span>
                </div>

                {/* View Mode Toggle */}
                <div
                    className="flex shrink-0 overflow-hidden rounded-lg bg-white/50 dark:bg-white/5"
                    role="group"
                    aria-label="View mode"
                >
                    <Button
                        variant={viewMode === "grid" ? "secondary" : "ghost"}
                        size="icon"
                        className="size-11 rounded-lg"
                        onClick={() => setViewMode("grid")}
                        aria-label="Grid view"
                        aria-pressed={viewMode === "grid"}
                    >
                        <Grid3X3 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        size="icon"
                        className="size-11 rounded-lg"
                        onClick={() => setViewMode("list")}
                        aria-label="List view"
                        aria-pressed={viewMode === "list"}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewMode === "map" ? "secondary" : "ghost"}
                        size="icon"
                        className="size-11 rounded-lg"
                        onClick={() => setViewMode("map")}
                        aria-label="Map view"
                        aria-pressed={viewMode === "map"}
                    >
                        <Map className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>
            </div>

            {/* Spots Grid/List */}
            <ErrorBoundary>
                <div className="pb-[calc(7rem+env(safe-area-inset-bottom,0px))] md:pb-0">
                {hasSpots ? (
                    <>
                        {viewMode === "map" ? (
                            <SpotsMap
                                key={searchParams.toString()}
                                spots={initialSpots}
                                city={currentFilters.city || undefined}
                                currentPage={currentPage}
                                onClose={() => setViewMode("grid")}
                                footer={
                                    <SpotsPagination
                                        currentPage={currentPage}
                                        totalCount={totalCount}
                                        pageSize={pageSize}
                                        onPageChange={handlePageChange}
                                        isPending={isPending}
                                    />
                                }
                            />
                        ) : (
                            <div
                                data-spot-view={viewMode}
                                className={cn(
                                    viewMode === "grid" ? "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "grid grid-cols-1 gap-3",
                                    "transition-opacity duration-200",
                                    isPending && "opacity-60"
                                )}
                            >
                                {cards}
                            </div>
                        )}

                        {/* Pagination (the map view carries it in its list sheet) */}
                        {viewMode !== "map" && <SpotsPagination
                            currentPage={currentPage}
                            totalCount={totalCount}
                            pageSize={pageSize}
                            onPageChange={handlePageChange}
                            isPending={isPending}
                        />}
                    </>
                ) : (
                    <div className="text-center py-16">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/20 mb-4">
                            <Search
                                className="h-8 w-8 text-violet-600"
                                aria-hidden="true"
                            />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No spots found</h3>
                        <p className="text-muted-foreground mb-4">
                            Try adjusting your filters or search query
                        </p>
                        {hasActiveFilters && (
                            <Button onClick={clearFilters} variant="outline">
                                Clear all filters
                            </Button>
                        )}
                    </div>
                )}
                </div>
            </ErrorBoundary>
        </>
    );
}

/** Publishes the floating filter bar height, so the phone map starts below it (0 when not floating). */
function useMapFiltersHeight(ref: { current: HTMLElement | null }, active: boolean) {
    useEffect(() => {
        const root = document.documentElement;
        const element = ref.current;
        if (!active || !element) return;
        const measure = () => {
            const floating = getComputedStyle(element).position === "fixed";
            root.style.setProperty("--ll-map-filters-height", floating ? `${element.offsetHeight}px` : "0px");
        };
        measure();
        const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        observer?.observe(element);
        window.addEventListener("resize", measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", measure);
            root.style.removeProperty("--ll-map-filters-height");
        };
    }, [ref, active]);
}
