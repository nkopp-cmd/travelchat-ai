"use client";

import { ErrorBoundary } from "@/components/error-boundary";
import { SpotCard } from "@/components/spots/spot-card";
import { createSupabaseClient } from "@/lib/supabase";
import { Spot, MultiLanguageField } from "@/types";
import { SpotCardSkeleton } from "@/components/ui/skeleton";
import { useEffect, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, MapPin, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

// Supabase spot raw type
interface RawSpot {
    id: string;
    name: MultiLanguageField;
    description: MultiLanguageField;
    address: MultiLanguageField;
    category: string | null;
    subcategories: string[] | null;
    location: {
        coordinates: [number, number];
    } | null;
    localley_score: number | null;
    local_percentage: number | null;
    best_time: string | null;
    photos: string[] | null;
    image_url: string | null;
    tips: string[] | null;
    verified: boolean | null;
    trending_score: number;
}

const CATEGORIES = ["All", "Food", "Cafe", "Nightlife", "Shopping", "Outdoor", "Market"];
const CITIES = ["All", "Seoul", "Tokyo", "Bangkok", "Singapore"];
const SCORES = ["All", "6 - Legendary", "5 - Hidden Gem", "4 - Local Favorite", "3 - Mixed Crowd"];

export default function SpotsPage() {
    const [spots, setSpots] = useState<Spot[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [selectedCity, setSelectedCity] = useState("All");
    const [selectedScore, setSelectedScore] = useState("All");
    const [sortBy, setSortBy] = useState("score"); // score, trending, newest

    useEffect(() => {
        async function fetchSpots() {
            const supabase = createSupabaseClient();
            const { data: spotsData, error } = await supabase
                .from("spots")
                .select("*")
                .order('localley_score', { ascending: false })
                .limit(50);

            if (error || !spotsData) {
                console.error("Error fetching spots:", error);
                setSpots([]);
                setLoading(false);
                return;
            }

            const getName = (field: MultiLanguageField): string => {
                if (typeof field === "object" && field !== null) {
                    return field.en || Object.values(field)[0] || "";
                }
                return field || "";
            };

            const getAddress = (field: MultiLanguageField): string => {
                if (typeof field === "object" && field !== null) {
                    return field.en || Object.values(field)[0] || "";
                }
                return field || "";
            };

            const parsedSpots: Spot[] = spotsData.map((spot: RawSpot) => {
                const lat = spot.location?.coordinates?.[1] || 0;
                const lng = spot.location?.coordinates?.[0] || 0;

                return {
                    id: spot.id,
                    name: getName(spot.name),
                    description: getName(spot.description),
                    category: spot.category || "Uncategorized",
                    subcategories: spot.subcategories || [],
                    location: {
                        lat,
                        lng,
                        address: getAddress(spot.address)
                    },
                    localleyScore: spot.localley_score || 3,
                    localPercentage: spot.local_percentage || 50,
                    bestTime: spot.best_time || "Anytime",
                    photos: spot.photos || [spot.image_url || "/placeholder-spot.jpg"],
                    tips: spot.tips || [],
                    verified: spot.verified || false,
                    trending: spot.trending_score > 0.7 || false
                };
            });

            setSpots(parsedSpots);
            setLoading(false);
        }

        fetchSpots();
    }, []);

    // Filter and sort spots
    const filteredSpots = useMemo(() => {
        let filtered = [...spots];

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
    }, [spots, searchQuery, selectedCategory, selectedCity, selectedScore, sortBy]);

    const clearFilters = () => {
        setSearchQuery("");
        setSelectedCategory("All");
        setSelectedCity("All");
        setSelectedScore("All");
        setSortBy("score");
    };

    const hasActiveFilters = searchQuery || selectedCategory !== "All" || selectedCity !== "All" || selectedScore !== "All";

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold mb-6">Discover Hidden Gems</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[...Array(6)].map((_, i) => (
                        <SpotCardSkeleton key={i} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                    Discover Hidden Gems
                </h1>
                <p className="text-muted-foreground">
                    {spots.length} local favorites across Seoul, Tokyo, Bangkok, and Singapore
                </p>
            </div>

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
                    />
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Filter className="h-4 w-4" />
                        Filters:
                    </div>

                    {/* Category Filter */}
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="w-[160px]">
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
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="City" />
                        </SelectTrigger>
                        <SelectContent>
                            {CITIES.map(city => (
                                <SelectItem key={city} value={city}>
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-3 w-3" />
                                        {city}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Score Filter */}
                    <Select value={selectedScore} onValueChange={setSelectedScore}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Localley Score" />
                        </SelectTrigger>
                        <SelectContent>
                            {SCORES.map(score => (
                                <SelectItem key={score} value={score}>
                                    <div className="flex items-center gap-2">
                                        <Star className="h-3 w-3" />
                                        {score}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Sort By */}
                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[160px]">
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
                            <X className="h-4 w-4 mr-1" />
                            Clear
                        </Button>
                    )}
                </div>

                {/* Active Filters Display */}
                {hasActiveFilters && (
                    <div className="flex flex-wrap gap-2">
                        {searchQuery && (
                            <Badge variant="secondary" className="gap-1">
                                Search: &quot;{searchQuery}&quot;
                                <X
                                    className="h-3 w-3 cursor-pointer"
                                    onClick={() => setSearchQuery("")}
                                />
                            </Badge>
                        )}
                        {selectedCategory !== "All" && (
                            <Badge variant="secondary" className="gap-1">
                                {selectedCategory}
                                <X
                                    className="h-3 w-3 cursor-pointer"
                                    onClick={() => setSelectedCategory("All")}
                                />
                            </Badge>
                        )}
                        {selectedCity !== "All" && (
                            <Badge variant="secondary" className="gap-1">
                                <MapPin className="h-3 w-3" />
                                {selectedCity}
                                <X
                                    className="h-3 w-3 cursor-pointer"
                                    onClick={() => setSelectedCity("All")}
                                />
                            </Badge>
                        )}
                        {selectedScore !== "All" && (
                            <Badge variant="secondary" className="gap-1">
                                <Star className="h-3 w-3" />
                                {selectedScore}
                                <X
                                    className="h-3 w-3 cursor-pointer"
                                    onClick={() => setSelectedScore("All")}
                                />
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            {/* Results Count */}
            <div className="mb-4 text-sm text-muted-foreground">
                Showing {filteredSpots.length} of {spots.length} spots
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
                            <Search className="h-8 w-8 text-violet-600" />
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
        </div>
    );
}
