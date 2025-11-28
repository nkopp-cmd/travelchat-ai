"use client";

import { ErrorBoundary } from "@/components/error-boundary";
import { SpotCard } from "@/components/spots/spot-card";
import { createSupabaseClient } from "@/lib/supabase";
import { Spot, MultiLanguageField } from "@/types";
import { SpotCardSkeleton } from "@/components/ui/skeleton";
import { useEffect, useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, MapPin, Star, Sparkles, TrendingUp, Users, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

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

const CATEGORIES = [
    { value: "All", label: "All Categories", icon: Sparkles },
    { value: "Food", label: "Food & Dining", icon: Sparkles },
    { value: "Cafe", label: "Cafes", icon: Sparkles },
    { value: "Nightlife", label: "Nightlife", icon: Sparkles },
    { value: "Shopping", label: "Shopping", icon: Sparkles },
    { value: "Outdoor", label: "Outdoor", icon: Sparkles },
    { value: "Market", label: "Markets", icon: Sparkles },
];

const CITIES = [
    { value: "All", label: "All Cities" },
    { value: "Seoul", label: "Seoul" },
    { value: "Tokyo", label: "Tokyo" },
    { value: "Bangkok", label: "Bangkok" },
    { value: "Singapore", label: "Singapore" },
];

const SCORES = [
    { value: "All", label: "All Scores" },
    { value: "6", label: "Legendary" },
    { value: "5", label: "Hidden Gem" },
    { value: "4", label: "Local Favorite" },
    { value: "3", label: "Mixed Crowd" },
];

const SORT_OPTIONS = [
    { value: "score", label: "Highest Score", icon: Star },
    { value: "trending", label: "Trending", icon: TrendingUp },
    { value: "local", label: "Most Local", icon: Users },
];

export default function SpotsPage() {
    const [spots, setSpots] = useState<Spot[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [selectedCity, setSelectedCity] = useState("All");
    const [selectedScore, setSelectedScore] = useState("All");
    const [sortBy, setSortBy] = useState("score");

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
            const scoreValue = parseInt(selectedScore);
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
            <div className="min-h-screen">
                {/* Background */}
                <div className="fixed inset-0 -z-10 overflow-hidden">
                    <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-violet-500/15 to-transparent rounded-full blur-3xl animate-blob" />
                    <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/15 to-transparent rounded-full blur-3xl animate-blob animation-delay-2000" />
                </div>
                <div className="container mx-auto px-4 py-8">
                    <div className="mb-8 space-y-2">
                        <div className="h-12 w-80 bg-white/10 rounded-xl animate-pulse" />
                        <div className="h-6 w-60 bg-white/5 rounded-lg animate-pulse" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <SpotCardSkeleton key={i} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            {/* Animated gradient background */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-violet-500/15 to-transparent rounded-full blur-3xl animate-blob" />
                <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/15 to-transparent rounded-full blur-3xl animate-blob animation-delay-2000" />
                <div className="absolute -bottom-1/2 left-1/4 w-full h-full bg-gradient-radial from-purple-500/15 to-transparent rounded-full blur-3xl animate-blob animation-delay-4000" />
            </div>

            <div className="container mx-auto px-4 py-8 animate-in fade-in duration-500">
                {/* Hero Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                            <MapPin className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
                                Discover Hidden Gems
                            </h1>
                            <p className="text-muted-foreground">
                                {spots.length} local favorites across Seoul, Tokyo, Bangkok, and Singapore
                            </p>
                        </div>
                    </div>
                </div>

                {/* Search and Filters */}
                <GlassCard variant="gradient" hover={false} className="mb-8">
                    <GlassCardContent className="p-4 md:p-6 space-y-4">
                        {/* Search Bar */}
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                                placeholder="Search spots, neighborhoods, or cuisines..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-12 h-14 text-lg bg-white/5 border-white/20 focus:border-violet-500/50 rounded-xl"
                            />
                        </div>

                        {/* Category Pills */}
                        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                            <div className="flex gap-2 pb-2 md:flex-wrap">
                                {CATEGORIES.map((cat) => (
                                    <button
                                        key={cat.value}
                                        onClick={() => setSelectedCategory(cat.value)}
                                        className={cn(
                                            "flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
                                            "border backdrop-blur-sm",
                                            selectedCategory === cat.value
                                                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-transparent shadow-lg shadow-violet-500/25"
                                                : "bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30"
                                        )}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Advanced Filters Row */}
                        <div className="flex flex-wrap gap-3 items-center">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <SlidersHorizontal className="h-4 w-4" />
                                Filters:
                            </div>

                            {/* City Filter */}
                            <Select value={selectedCity} onValueChange={setSelectedCity}>
                                <SelectTrigger className="w-[150px] bg-white/5 border-white/20 focus:border-violet-500/50 rounded-xl">
                                    <MapPin className="h-4 w-4 mr-2 text-emerald-500" />
                                    <SelectValue placeholder="City" />
                                </SelectTrigger>
                                <SelectContent>
                                    {CITIES.map(city => (
                                        <SelectItem key={city.value} value={city.value}>
                                            {city.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Score Filter */}
                            <Select value={selectedScore} onValueChange={setSelectedScore}>
                                <SelectTrigger className="w-[160px] bg-white/5 border-white/20 focus:border-violet-500/50 rounded-xl">
                                    <Star className="h-4 w-4 mr-2 text-yellow-500" />
                                    <SelectValue placeholder="Score" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SCORES.map(score => (
                                        <SelectItem key={score.value} value={score.value}>
                                            {score.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Sort By */}
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="w-[160px] bg-white/5 border-white/20 focus:border-violet-500/50 rounded-xl">
                                    <TrendingUp className="h-4 w-4 mr-2 text-violet-500" />
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    {SORT_OPTIONS.map(option => (
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
                                    onClick={clearFilters}
                                    className="text-muted-foreground hover:text-foreground rounded-xl"
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
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
                                        Search: &quot;{searchQuery}&quot;
                                        <X
                                            className="h-3 w-3 cursor-pointer hover:text-white"
                                            onClick={() => setSearchQuery("")}
                                        />
                                    </span>
                                )}
                                {selectedCity !== "All" && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                        <MapPin className="h-3 w-3" />
                                        {selectedCity}
                                        <X
                                            className="h-3 w-3 cursor-pointer hover:text-white"
                                            onClick={() => setSelectedCity("All")}
                                        />
                                    </span>
                                )}
                                {selectedScore !== "All" && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                                        <Star className="h-3 w-3" />
                                        {SCORES.find(s => s.value === selectedScore)?.label}
                                        <X
                                            className="h-3 w-3 cursor-pointer hover:text-white"
                                            onClick={() => setSelectedScore("All")}
                                        />
                                    </span>
                                )}
                            </div>
                        )}
                    </GlassCardContent>
                </GlassCard>

                {/* Results Count */}
                <div className="mb-6 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing <span className="font-semibold text-foreground">{filteredSpots.length}</span> of {spots.length} spots
                    </p>
                </div>

                {/* Spots Grid */}
                <ErrorBoundary>
                    {filteredSpots.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredSpots.map((spot, index) => (
                                <div
                                    key={spot.id}
                                    className="animate-in fade-in slide-in-from-bottom-4"
                                    style={{ animationDelay: `${Math.min(index * 50, 300)}ms`, animationFillMode: "both" }}
                                >
                                    <SpotCard spot={spot} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <GlassCard variant="subtle" hover={false}>
                            <GlassCardContent className="py-16">
                                <div className="text-center">
                                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-500/20 mb-6">
                                        <Search className="h-10 w-10 text-violet-400" />
                                    </div>
                                    <h3 className="text-2xl font-semibold mb-2">No spots found</h3>
                                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                                        We couldn&apos;t find any spots matching your criteria. Try adjusting your filters or search query.
                                    </p>
                                    <Button
                                        onClick={clearFilters}
                                        className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25"
                                    >
                                        Clear all filters
                                    </Button>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    )}
                </ErrorBoundary>
            </div>
        </div>
    );
}
