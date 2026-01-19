"use client";

import { useState, useMemo, useDeferredValue } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useDuplicateItinerary, useDeleteItinerary } from "@/hooks/use-queries";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Search,
    Calendar,
    MoreVertical,
    Copy,
    Trash2,
    Share2,
    Gem,
    Grid3X3,
    List,
    SlidersHorizontal,
    Sparkles,
    Plus,
    Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Itinerary {
    id: string;
    title: string;
    subtitle?: string;
    city: string;
    days: number;
    local_score: number;
    created_at: string;
    status?: "draft" | "completed";
    is_favorite?: boolean;
}

interface ItineraryListProps {
    initialItineraries: Itinerary[];
}

type SortOption = "newest" | "oldest" | "score" | "alphabetical" | "days";
type ViewMode = "grid" | "list";

// Clean up title - remove AI chat-style prefixes
function cleanTitle(title: string): string {
    // Remove common AI chat prefixes
    const prefixes = [
        /^(Oh,?\s*)?[A-Za-z]+[—–-]\s*(nice pick!?\s*)?/i,
        /^(Great choice!?\s*)/i,
        /^(Awesome!?\s*)/i,
        /^(Perfect!?\s*)/i,
    ];
    let cleaned = title;
    for (const prefix of prefixes) {
        cleaned = cleaned.replace(prefix, "");
    }
    // Capitalize first letter
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Get display city - fallback for empty/unknown
function getDisplayCity(city: string | null | undefined): string {
    if (!city || city.toLowerCase() === "unknown city" || city.trim() === "") {
        return "Adventure Awaits";
    }
    return city;
}

export function ItineraryList({ initialItineraries }: ItineraryListProps) {
    const [itineraries, setItineraries] = useState(initialItineraries);
    const [searchQuery, setSearchQuery] = useState("");
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [filterDays, setFilterDays] = useState<string>("all");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const { toast } = useToast();

    const duplicateMutation = useDuplicateItinerary();
    const deleteMutation = useDeleteItinerary();

    // Get unique day counts for filter
    const dayOptions = useMemo(() => {
        const days = [...new Set(itineraries.map((i) => i.days))].sort((a, b) => a - b);
        return days;
    }, [itineraries]);

    // Filter and sort itineraries (use deferred search for performance)
    const filteredItineraries = useMemo(() => {
        let result = [...itineraries];

        // Search filter (using deferred value to avoid jank)
        if (deferredSearchQuery) {
            const query = deferredSearchQuery.toLowerCase();
            result = result.filter(
                (i) =>
                    i.title.toLowerCase().includes(query) ||
                    i.city?.toLowerCase().includes(query) ||
                    i.subtitle?.toLowerCase().includes(query)
            );
        }

        // Days filter
        if (filterDays !== "all") {
            result = result.filter((i) => i.days === parseInt(filterDays));
        }

        // Sort
        switch (sortBy) {
            case "newest":
                result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                break;
            case "oldest":
                result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                break;
            case "score":
                result.sort((a, b) => (b.local_score || 0) - (a.local_score || 0));
                break;
            case "alphabetical":
                result.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case "days":
                result.sort((a, b) => b.days - a.days);
                break;
        }

        return result;
    }, [itineraries, deferredSearchQuery, sortBy, filterDays]);

    const handleDuplicate = async (itinerary: Itinerary) => {
        duplicateMutation.mutate(itinerary.id, {
            onSuccess: (newItinerary) => {
                // Optimistically add to local state
                setItineraries((prev) => [{ ...newItinerary, local_score: newItinerary.localScore ?? 0, created_at: newItinerary.createdAt ?? new Date().toISOString() } as Itinerary, ...prev]);
                toast({
                    title: "Itinerary duplicated",
                    description: `"${itinerary.title}" has been duplicated.`,
                });
            },
            onError: (error) => {
                toast({
                    title: "Failed to duplicate",
                    description: error.message || "Please try again.",
                    variant: "destructive",
                });
            },
        });
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        deleteMutation.mutate(deleteId, {
            onSuccess: () => {
                setItineraries((prev) => prev.filter((i) => i.id !== deleteId));
                setDeleteId(null);
                toast({
                    title: "Itinerary deleted",
                    description: "Your itinerary has been deleted.",
                });
            },
            onError: (error) => {
                setDeleteId(null);
                toast({
                    title: "Failed to delete",
                    description: error.message || "Please try again.",
                    variant: "destructive",
                });
            },
        });
    };

    const handleShare = async (itinerary: Itinerary) => {
        const url = `${window.location.origin}/itineraries/${itinerary.id}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: itinerary.title,
                    text: `Check out my ${itinerary.days}-day itinerary for ${getDisplayCity(itinerary.city)}!`,
                    url,
                });
            } catch {
                // User cancelled or error
            }
        } else {
            await navigator.clipboard.writeText(url);
        }
    };

    const LocalScoreBadge = ({ score }: { score: number }) => (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                        <Gem className="h-3 w-3" />
                        <span className="text-xs font-semibold">{score || 0}/10</span>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">
                        <strong>Local Score:</strong> How &quot;off the beaten path&quot; this trip is. Higher = more hidden gems!
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );

    // City-specific gradient colors for visual variety (fallback)
    const getCityGradient = (city: string): string => {
        const gradients = [
            "from-rose-500/80 via-orange-400/60 to-amber-300/40",
            "from-violet-500/80 via-purple-400/60 to-fuchsia-300/40",
            "from-cyan-500/80 via-blue-400/60 to-indigo-300/40",
            "from-emerald-500/80 via-teal-400/60 to-green-300/40",
            "from-amber-500/80 via-yellow-400/60 to-lime-300/40",
            "from-pink-500/80 via-rose-400/60 to-red-300/40",
            "from-indigo-500/80 via-violet-400/60 to-purple-300/40",
            "from-teal-500/80 via-emerald-400/60 to-green-300/40",
        ];
        const hash = city.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return gradients[hash % gradients.length];
    };

    // Get city image URL - uses curated Unsplash images for known cities
    const getCityImageUrl = (city: string): string | null => {
        const cityLower = city.toLowerCase().trim();

        // Map of cities to their Unsplash photo IDs (curated for quality)
        const cityImages: Record<string, string> = {
            // Asia
            "tokyo": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&q=80",
            "seoul": "https://images.unsplash.com/photo-1538485399081-7191377e8241?w=800&q=80",
            "bangkok": "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&q=80",
            "singapore": "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=80",
            "hong kong": "https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=800&q=80",
            "osaka": "https://images.unsplash.com/photo-1590559899731-a382839e5549?w=800&q=80",
            "kyoto": "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80",
            "taipei": "https://images.unsplash.com/photo-1470004914212-05527e49370b?w=800&q=80",
            "bali": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80",
            "hanoi": "https://images.unsplash.com/photo-1509030450996-dd1a26dda07a?w=800&q=80",
            "ho chi minh": "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&q=80",
            "kuala lumpur": "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80",
            "manila": "https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86?w=800&q=80",
            // Europe
            "paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80",
            "london": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&q=80",
            "rome": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80",
            "barcelona": "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&q=80",
            "amsterdam": "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&q=80",
            "berlin": "https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800&q=80",
            // Americas
            "new york": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&q=80",
            "los angeles": "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=800&q=80",
            "san francisco": "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&q=80",
            "miami": "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=800&q=80",
            // Oceania
            "sydney": "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&q=80",
            "melbourne": "https://images.unsplash.com/photo-1514395462725-fb4566210144?w=800&q=80",
        };

        // Check for exact match or partial match
        for (const [key, url] of Object.entries(cityImages)) {
            if (cityLower.includes(key) || key.includes(cityLower)) {
                return url;
            }
        }

        return null;
    };

    // Enhanced card header with city image or gradient fallback
    const CardHeader = ({ city, days }: { city: string; days: number }) => {
        const gradient = getCityGradient(city);
        const imageUrl = getCityImageUrl(city);

        return (
            <div className="w-full h-full relative overflow-hidden bg-muted">
                {imageUrl ? (
                    // City image
                    <Image
                        src={imageUrl}
                        alt={city}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 400px"
                    />
                ) : (
                    // Gradient fallback for unknown cities
                    <div className={cn("w-full h-full bg-gradient-to-br", gradient)} />
                )}

                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* City name */}
                <div className="absolute bottom-2 left-3 right-12">
                    <span className="text-white text-sm font-medium drop-shadow-lg truncate block">
                        {getDisplayCity(city).split(",")[0]}
                    </span>
                </div>

                {/* Days badge */}
                <div className="absolute bottom-2 right-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-black/60 text-white backdrop-blur-sm">
                        <Calendar className="h-3 w-3" />
                        {days}d
                    </span>
                </div>
            </div>
        );
    };

    if (itineraries.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl bg-muted/20">
                <div className="h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-violet-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No itineraries yet</h3>
                <p className="text-muted-foreground mb-6 text-center max-w-md">
                    Start planning your next adventure with AI-powered recommendations for hidden gems and local favorites
                </p>
                <Link href="/itineraries/new">
                    <Button className="bg-violet-600 hover:bg-violet-700">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Create Your First Itinerary
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Simplified Search and Controls Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search - standalone and prominent */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search itineraries..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Compact Controls Group */}
                <div className="flex items-center gap-2">
                    {/* Filters Dropdown - combines duration filter and sort */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                                <SlidersHorizontal className="h-4 w-4" />
                                <span className="hidden sm:inline">Filters</span>
                                {(filterDays !== "all" || sortBy !== "newest") && (
                                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {/* Duration Filter */}
                            <div className="px-2 py-1.5">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Duration</p>
                                <Select value={filterDays} onValueChange={setFilterDays}>
                                    <SelectTrigger className="w-full h-8 text-sm">
                                        <SelectValue placeholder="All durations" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All durations</SelectItem>
                                        {dayOptions.map((days) => (
                                            <SelectItem key={days} value={days.toString()}>
                                                {days} {days === 1 ? "day" : "days"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <DropdownMenuSeparator />
                            {/* Sort */}
                            <div className="px-2 py-1.5">
                                <p className="text-xs font-medium text-muted-foreground mb-2">Sort by</p>
                                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                                    <SelectTrigger className="w-full h-8 text-sm">
                                        <SelectValue placeholder="Sort" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="newest">Newest first</SelectItem>
                                        <SelectItem value="oldest">Oldest first</SelectItem>
                                        <SelectItem value="score">Highest score</SelectItem>
                                        <SelectItem value="alphabetical">A-Z</SelectItem>
                                        <SelectItem value="days">Duration</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {/* Clear Filters */}
                            {(filterDays !== "all" || sortBy !== "newest") && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setFilterDays("all");
                                            setSortBy("newest");
                                        }}
                                        className="text-violet-600 focus:text-violet-600"
                                    >
                                        Clear filters
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* View Mode Toggle */}
                    <div className="flex border rounded-md" role="group" aria-label="View mode">
                        <Button
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            size="icon"
                            className="h-9 w-9 rounded-r-none"
                            onClick={() => setViewMode("grid")}
                            aria-label="Grid view"
                            aria-pressed={viewMode === "grid"}
                        >
                            <Grid3X3 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === "list" ? "secondary" : "ghost"}
                            size="icon"
                            className="h-9 w-9 rounded-l-none"
                            onClick={() => setViewMode("list")}
                            aria-label="List view"
                            aria-pressed={viewMode === "list"}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Featured "Continue" Module - Most Recent Itinerary */}
            {filteredItineraries.length > 0 && !searchQuery && filterDays === "all" && (
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        <span className="text-sm font-medium text-muted-foreground">Continue where you left off</span>
                    </div>
                    <Link href={`/itineraries/${filteredItineraries[0].id}`}>
                        <Card className="overflow-hidden border-violet-200 dark:border-violet-800/50 bg-gradient-to-r from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20 hover:shadow-lg hover:border-violet-300 dark:hover:border-violet-700 transition-all group">
                            <div className="flex items-center gap-4 p-4">
                                {/* Mini thumbnail with city image */}
                                <div className="h-16 w-16 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-violet-200 dark:ring-violet-800 relative">
                                    {getCityImageUrl(filteredItineraries[0].city || "") ? (
                                        <Image
                                            src={getCityImageUrl(filteredItineraries[0].city || "")!}
                                            alt={filteredItineraries[0].city || "Trip"}
                                            fill
                                            className="object-cover"
                                            sizes="64px"
                                        />
                                    ) : (
                                        <div className={cn("w-full h-full bg-gradient-to-br relative", getCityGradient(filteredItineraries[0].city || "Trip"))}>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-2xl font-bold text-white/80">
                                                    {(filteredItineraries[0].city || "T").charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-base truncate group-hover:text-violet-600 transition-colors">
                                        {cleanTitle(filteredItineraries[0].title)}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {getDisplayCity(filteredItineraries[0].city)} • {filteredItineraries[0].days} days
                                    </p>
                                </div>
                                {/* Continue button */}
                                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 flex-shrink-0">
                                    Continue
                                </Button>
                            </div>
                        </Card>
                    </Link>
                </div>
            )}

            {/* Results count */}
            <p className="text-sm text-muted-foreground">
                {filteredItineraries.length} {filteredItineraries.length === 1 ? "itinerary" : "itineraries"}
                {searchQuery && ` matching "${searchQuery}"`}
            </p>

            {/* Itinerary Grid/List */}
            {filteredItineraries.length > 0 ? (
                <div
                    className={cn(
                        viewMode === "grid"
                            ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3"
                            : "flex flex-col gap-3"
                    )}
                >
                    {filteredItineraries.map((itinerary) => {
                        const displayCity = getDisplayCity(itinerary.city);
                        const cleanedTitle = cleanTitle(itinerary.title);

                        return (
                            <Card
                                key={itinerary.id}
                                className={cn(
                                    "group overflow-hidden relative",
                                    "bg-card/95 backdrop-blur-sm",
                                    "border border-border/50",
                                    "transition-all duration-300 ease-out",
                                    "hover:shadow-2xl hover:shadow-violet-500/15",
                                    "hover:border-violet-400/60 dark:hover:border-violet-500/60",
                                    "hover:-translate-y-1",
                                    viewMode === "list" ? "flex flex-row" : "flex flex-col"
                                )}
                            >
                                {/* Gradient glow effect on hover */}
                                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                                    <div className="absolute inset-[-1px] rounded-xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-indigo-500/10 blur-sm" />
                                </div>

                                {/* Enhanced Thumbnail with City Visual */}
                                <div
                                    className={cn(
                                        "relative overflow-hidden flex-shrink-0",
                                        viewMode === "grid" ? "h-40" : "w-40 min-h-[130px]"
                                    )}
                                >
                                    <CardHeader city={displayCity} days={itinerary.days} />
                                    {/* Image hover zoom effect */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                </div>

                                {/* Content - streamlined since city is in header */}
                                <div className={cn(
                                    "flex-1 flex flex-col min-w-0 relative z-10",
                                    viewMode === "list" ? "p-4" : "p-4"
                                )}>
                                    <Link href={`/itineraries/${itinerary.id}`} className="block flex-1">
                                        <h3 className="font-semibold text-base leading-snug line-clamp-2 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors duration-200 mb-2">
                                            {cleanedTitle}
                                        </h3>

                                        <div className="flex items-center gap-2 mb-2">
                                            <LocalScoreBadge score={itinerary.local_score} />
                                        </div>
                                    </Link>

                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/30">
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            {new Date(itinerary.created_at).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                            })}
                                        </div>

                                        {/* View details hint on hover */}
                                        <span className="text-xs text-violet-600 dark:text-violet-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 mr-8">
                                            View →
                                        </span>

                                        {/* Actions Menu */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-all duration-200 absolute right-3 bottom-3 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                                                    onClick={(e) => e.preventDefault()}
                                                    aria-label={`Actions for ${cleanedTitle}`}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem
                                                    onClick={() => handleDuplicate(itinerary)}
                                                    disabled={duplicateMutation.isPending}
                                                    className="gap-2"
                                                >
                                                    <Copy className="h-4 w-4" />
                                                    {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleShare(itinerary)} className="gap-2">
                                                    <Share2 className="h-4 w-4" />
                                                    Share
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive gap-2"
                                                    onClick={() => setDeleteId(itinerary.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}

                    {/* Add New Card - Premium style */}
                    {viewMode === "grid" && (
                        <Link href="/itineraries/new">
                            <Card className={cn(
                                "min-h-[240px] relative overflow-hidden",
                                "border-2 border-dashed border-violet-300/70 dark:border-violet-700/70",
                                "bg-gradient-to-br from-violet-50/50 to-indigo-50/50 dark:from-violet-950/20 dark:to-indigo-950/20",
                                "hover:border-violet-400 dark:hover:border-violet-500",
                                "hover:shadow-xl hover:shadow-violet-500/10",
                                "transition-all duration-300 cursor-pointer",
                                "flex items-center justify-center group"
                            )}>
                                {/* Background pattern */}
                                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
                                     style={{
                                       backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                                     }} />

                                <div className="text-center p-6 relative z-10">
                                    <div className={cn(
                                        "h-14 w-14 rounded-2xl mx-auto mb-4",
                                        "bg-gradient-to-br from-violet-500 to-indigo-600",
                                        "flex items-center justify-center",
                                        "shadow-lg shadow-violet-500/30",
                                        "group-hover:scale-110 group-hover:shadow-violet-500/40",
                                        "transition-all duration-300"
                                    )}>
                                        <Plus className="h-7 w-7 text-white" />
                                    </div>
                                    <p className="text-base font-semibold text-foreground/80 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors mb-1">
                                        Create New Itinerary
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Plan your next adventure
                                    </p>
                                </div>
                            </Card>
                        </Link>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No itineraries found</h3>
                    <p className="text-muted-foreground">
                        Try adjusting your search or filters
                    </p>
                    <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => {
                            setSearchQuery("");
                            setFilterDays("all");
                        }}
                    >
                        Clear Filters
                    </Button>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Itinerary?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete your itinerary and all its activities.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleteMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
