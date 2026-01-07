"use client";

import { useState, useMemo } from "react";
import { SpotCard } from "@/components/spots/spot-card";
import { Spot } from "@/types";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/error-boundary";

const CATEGORIES = ["All", "Food", "Cafe", "Nightlife", "Shopping", "Outdoor", "Market"];
const CITIES = ["All", "Seoul", "Tokyo", "Bangkok", "Singapore"];
const SCORES = ["All", "6 - Legendary", "5 - Hidden Gem", "4 - Local Favorite", "3 - Mixed Crowd"];

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

    // Filter and sort spots
    const filteredSpots = useMemo(() => {
        let filtered = [...initialSpots];

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(spot =>
                spot.name.toLowerCase().includes(query) ||
                spot.description.toLowerCase().includes(query) ||
                spot.location.address.toLowerCase().includes(query)
            );
        }

        // Category filter
        if (selectedCategory !== "All") {
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
    }, [initialSpots, searchQuery, selectedCategory, selectedCity, selectedScore, sortBy]);

    const clearFilters = () => {
        setSearchQuery("");
        setSelectedCategory("All");
        setSelectedCity("All");
        setSelectedScore("All");
        setSortBy("score");
    };

    const hasActiveFilters = searchQuery || selectedCategory !== "All" || selectedCity !== "All" || selectedScore !== "All";

    return (
        <>
            {/* Search and Filters */}
            <div className="mb-8 space-y-4">
                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search spots, neighborhoods, or cuisines..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-12 text-lg"
                        aria-label="Search spots"
                    />
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap gap-3 items-center" role="group" aria-label="Filter options">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Filter className="h-4 w-4" aria-hidden="true" />
                        Filters:
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

            {/* Spots Grid */}
            <ErrorBoundary>
                {filteredSpots.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredSpots.map((spot) => (
                            <SpotCard key={spot.id} spot={spot} />
                        ))}
                    </div>
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
