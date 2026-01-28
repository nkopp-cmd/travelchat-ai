"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SpotCard } from "@/components/spots/spot-card";
import { SpotsFilterBar } from "./spots-filter-bar";
import { SpotsPagination } from "./spots-pagination";
import { Spot } from "@/types";
import { SpotsFilterState, FilterOptions } from "@/lib/spots/types";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Grid3X3, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpotsExplorerProps {
    initialSpots: Spot[];
    totalCount: number;
    currentPage: number;
    pageSize: number;
    hasMore: boolean;
    filterOptions: FilterOptions;
    currentFilters: SpotsFilterState;
}

/**
 * Client component for interactive spots exploration
 * Manages filter UI and URL state synchronization
 */
export function SpotsExplorer({
    initialSpots,
    totalCount,
    currentPage,
    pageSize,
    hasMore,
    filterOptions,
    currentFilters,
}: SpotsExplorerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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
            // Scroll to top of results
            window.scrollTo({ top: 0, behavior: "smooth" });
        },
        [updateFilters]
    );

    /**
     * Clear all filters
     */
    const clearFilters = useCallback(() => {
        startTransition(() => {
            router.push(pathname);
        });
    }, [router, pathname]);

    const hasActiveFilters =
        currentFilters.city ||
        currentFilters.category ||
        currentFilters.score ||
        currentFilters.search;

    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, totalCount);

    return (
        <>
            {/* Filter Bar */}
            <SpotsFilterBar
                filterOptions={filterOptions}
                currentFilters={currentFilters}
                onFilterChange={handleFilterChange}
                onClearFilters={clearFilters}
                isPending={isPending}
            />

            {/* Results Header */}
            <div className="mb-4 flex items-center justify-between">
                <div
                    className="text-sm text-muted-foreground flex items-center gap-2"
                    aria-live="polite"
                >
                    {isPending && (
                        <Loader2
                            className="h-4 w-4 animate-spin text-violet-500"
                            aria-hidden="true"
                        />
                    )}
                    <span>
                        {isPending
                            ? "Loading..."
                            : totalCount > 0
                                ? `Showing ${startIndex}-${endIndex} of ${totalCount} spots`
                                : "No spots found"}
                    </span>
                </div>

                {/* View Mode Toggle */}
                <div
                    className="flex border border-black/5 dark:border-white/10 rounded-lg overflow-hidden bg-white/50 dark:bg-white/5"
                    role="group"
                    aria-label="View mode"
                >
                    <Button
                        variant={viewMode === "grid" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-9 w-9 rounded-none"
                        onClick={() => setViewMode("grid")}
                        aria-label="Grid view"
                        aria-pressed={viewMode === "grid"}
                    >
                        <Grid3X3 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={viewMode === "list" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-9 w-9 rounded-none"
                        onClick={() => setViewMode("list")}
                        aria-label="List view"
                        aria-pressed={viewMode === "list"}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Spots Grid/List */}
            <ErrorBoundary>
                {initialSpots.length > 0 ? (
                    <>
                        {viewMode === "grid" ? (
                            <div
                                className={cn(
                                    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6",
                                    "transition-opacity duration-200",
                                    isPending && "opacity-60"
                                )}
                            >
                                {initialSpots.map((spot, index) => (
                                    <SpotCard
                                        key={spot.id}
                                        spot={spot}
                                        priority={index < 6}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div
                                className={cn(
                                    "space-y-3 transition-opacity duration-200",
                                    isPending && "opacity-60"
                                )}
                            >
                                {initialSpots.map((spot, index) => (
                                    <SpotCard
                                        key={spot.id}
                                        spot={spot}
                                        compact
                                        priority={index < 3}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        <SpotsPagination
                            currentPage={currentPage}
                            totalCount={totalCount}
                            pageSize={pageSize}
                            onPageChange={handlePageChange}
                            isPending={isPending}
                        />
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
            </ErrorBoundary>
        </>
    );
}
