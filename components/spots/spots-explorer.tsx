"use client";

import { useState, useMemo } from "react";
import { SpotCard } from "@/components/spots/spot-card";
import { Spot } from "@/types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, MapPin, Star, Grid3X3, List, Utensils, Coffee, Moon, ShoppingBag, Trees, Store, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/error-boundary";

const CATEGORIES = ["All", "Food", "Cafe", "Nightlife", "Shopping", "Outdoor", "Market"];
const CITIES = ["All", "Seoul", "Tokyo", "Bangkok", "Singapore"];
const SCORES = ["All", "6 - Legendary", "5 - Hidden Gem", "4 - Local Favorite", "3 - Mixed Crowd"];

// Quick filter chips with icons and colors
const QUICK_FILTERS = [
    { id: "trending", label: "Trending", icon: Flame, color: "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400" },
    { id: "Food", label: "Food", icon: Utensils, color: "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400" },
    { id: "Cafe", label: "Cafes", icon: Coffee, color: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400" },
    { id: "Nightlife", label: "Nightlife", icon: Moon, color: "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400" },
    { id: "Shopping", label: "Shopping", icon: ShoppingBag, color: "bg-pink-100 text-pink-700 hover:bg-pink-200 dark:bg-pink-900/30 dark:text-pink-400" },
    { id: "Outdoor", label: "Outdoor", icon: Trees, color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" },
    { id: "Market", label: "Markets", icon: Store, color: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400" },
];

interface SpotsExplorerProps {
    /**
     * Initial spots data fetched from the server
     */
    initialSpots: Spot[];
    /**
     * Total number of spots available
     */
    totalCount: number;
}

/**
 * Client component for interactive spots exploration.
 * Handles filtering, sorting, and search functionality.
 */
export function SpotsExplorer({ initialSpots, totalCount }: SpotsExplorerProps) {
    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [selectedCity, setSelectedCity] = useState("All");
    const [selectedScore, setSelectedScore] = useState("All");
    const [sortBy, setSortBy] = useState("score");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [quickFilter, setQuickFilter] = useState<string | null>(null);

    // Filter and sort spots
    const filteredSpots = useMemo(() => {
        let filtered = [...initialSpots];

        // Quick filter (trending or category)
        if (quickFilter) {
            if (quickFilter === "trending") {
                filtered = filtered.filter(spot => spot.trending);
            } else {
                filtered = filtered.filter(spot => spot.category === quickFilter);
            }
        }

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(spot =>
                spot.name.toLowerCase().includes(query) ||
                spot.description.toLowerCase().includes(query) ||
                spot.location.address.toLowerCase().includes(query)
            );
        }

        // Category filter (from dropdown, only if no quick filter)
        if (selectedCategory !== "All" && !quickFilter) {
            filtered = filtered.filter(spot => spot.category === selectedCategory);
        }

        // City filter
        if (selectedCity !== "All") {
            filtered = filtered.filter(spot =>
                spot.location.address.toLowerCase().includes(selectedCity.toLowerCase())
            );
        }

        // Score filter
        if (selectedScore !== "All") {
            const scoreValue = parseInt(selectedScore.split(" ")[0]);
            filtered = filtered.filter(spot => spot.localleyScore === scoreValue);
        }

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case "score":
                    return b.localleyScore - a.localleyScore;
                case "trending":
                    return (b.trending ? 1 : 0) - (a.trending ? 1 : 0);
                case "local":
                    return b.localPercentage - a.localPercentage;
                default:
                    return 0;
            }
        });

        return filtered;
    }, [initialSpots, searchQuery, selectedCategory, selectedCity, selectedScore, sortBy, quickFilter]);

    const clearFilters = () => {
        setSearchQuery("");
        setSelectedCategory("All");
        setSelectedCity("All");
        setSelectedScore("All");
        setSortBy("score");
        setQuickFilter(null);
    };

    const handleQuickFilter = (filterId: string) => {
        setQuickFilter(quickFilter === filterId ? null : filterId);
        // Clear category dropdown when using quick filter
        if (quickFilter !== filterId) {
            setSelectedCategory("All");
        }
    };

    const hasActiveFilters = searchQuery || selectedCategory !== "All" || selectedCity !== "All" || selectedScore !== "All" || quickFilter !== null;

    return (
        <>
            {/* Search and Filters */}
            <div className="mb-6 space-y-4">
                {/* Search Bar with View Toggle */}
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                        <Input
                            placeholder="Search spots, neighborhoods, or cuisines..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-11"
                            aria-label="Search spots"
                        />
                    </div>
                    {/* View Mode Toggle */}
                    <div className="flex border rounded-lg overflow-hidden" role="group" aria-label="View mode">
                        <Button
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            size="icon"
                            className="h-11 w-11 rounded-none"
                            onClick={() => setViewMode("grid")}
                            aria-label="Grid view"
                            aria-pressed={viewMode === "grid"}
                        >
                            <Grid3X3 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === "list" ? "secondary" : "ghost"}
                            size="icon"
                            className="h-11 w-11 rounded-none"
                            onClick={() => setViewMode("list")}
                            aria-label="List view"
                            aria-pressed={viewMode === "list"}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Quick Filter Chips */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="group" aria-label="Quick filters">
                    {QUICK_FILTERS.map((filter) => {
                        const Icon = filter.icon;
                        const isActive = quickFilter === filter.id;
                        return (
                            <button
                                key={filter.id}
                                onClick={() => handleQuickFilter(filter.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                                    isActive
                                        ? `${filter.color} ring-2 ring-offset-1 ring-current`
                                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                }`}
                                aria-pressed={isActive}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {filter.label}
                            </button>
                        );
                    })}
                </div>

                {/* Advanced Filters Row */}
                <div className="flex flex-wrap gap-3 items-center" role="group" aria-label="Filter options">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Filter className="h-4 w-4" aria-hidden="true" />
                        More:
                    </div>

                    {/* Category Filter */}
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="w-[160px]" aria-label="Select category">
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                            {CATEGORIES.map(cat => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* City Filter */}
                    <Select value={selectedCity} onValueChange={setSelectedCity}>
                        <SelectTrigger className="w-[160px]" aria-label="Select city">
                            <SelectValue placeholder="City" />
                        </SelectTrigger>
                        <SelectContent>
                            {CITIES.map(city => (
                                <SelectItem key={city} value={city}>
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-3 w-3" aria-hidden="true" />
                                        {city}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Score Filter */}
                    <Select value={selectedScore} onValueChange={setSelectedScore}>
                        <SelectTrigger className="w-[180px]" aria-label="Select Localley score">
                            <SelectValue placeholder="Localley Score" />
                        </SelectTrigger>
                        <SelectContent>
                            {SCORES.map(score => (
                                <SelectItem key={score} value={score}>
                                    <div className="flex items-center gap-2">
                                        <Star className="h-3 w-3" aria-hidden="true" />
                                        {score}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Sort By */}
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[160px]" aria-label="Sort by">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="score">Highest Score</SelectItem>
                            <SelectItem value="trending">Trending</SelectItem>
                            <SelectItem value="local">Most Local</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Clear Filters */}
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearFilters}
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
                        {searchQuery && (
                            <Badge variant="secondary" className="gap-1">
                                Search: &quot;{searchQuery}&quot;
                                <button
                                    onClick={() => setSearchQuery("")}
                                    aria-label="Remove search filter"
                                    className="ml-1 hover:bg-muted rounded-full"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        )}
                        {selectedCategory !== "All" && (
                            <Badge variant="secondary" className="gap-1">
                                {selectedCategory}
                                <button
                                    onClick={() => setSelectedCategory("All")}
                                    aria-label={`Remove ${selectedCategory} filter`}
                                    className="ml-1 hover:bg-muted rounded-full"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        )}
                        {selectedCity !== "All" && (
                            <Badge variant="secondary" className="gap-1">
                                <MapPin className="h-3 w-3" aria-hidden="true" />
                                {selectedCity}
                                <button
                                    onClick={() => setSelectedCity("All")}
                                    aria-label={`Remove ${selectedCity} filter`}
                                    className="ml-1 hover:bg-muted rounded-full"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        )}
                        {selectedScore !== "All" && (
                            <Badge variant="secondary" className="gap-1">
                                <Star className="h-3 w-3" aria-hidden="true" />
                                {selectedScore}
                                <button
                                    onClick={() => setSelectedScore("All")}
                                    aria-label={`Remove ${selectedScore} filter`}
                                    className="ml-1 hover:bg-muted rounded-full"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            {/* Results Count */}
            <div className="mb-4 text-sm text-muted-foreground" aria-live="polite">
                Showing {filteredSpots.length} of {totalCount} spots
            </div>

            {/* Spots Grid/List */}
            <ErrorBoundary>
                {filteredSpots.length > 0 ? (
                    viewMode === "grid" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredSpots.map((spot) => (
                                <SpotCard key={spot.id} spot={spot} />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredSpots.map((spot) => (
                                <SpotCard key={spot.id} spot={spot} compact />
                            ))}
                        </div>
                    )
                ) : (
                    <div className="text-center py-16">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/20 mb-4">
                            <Search className="h-8 w-8 text-violet-600" aria-hidden="true" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No spots found</h3>
                        <p className="text-muted-foreground mb-4">
                            Try adjusting your filters or search query
                        </p>
                        <Button onClick={clearFilters} variant="outline">
                            Clear all filters
                        </Button>
                    </div>
                )}
            </ErrorBoundary>
        </>
    );
}
