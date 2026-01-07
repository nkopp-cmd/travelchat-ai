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

    // City-specific gradient colors for visual variety
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

    // Enhanced card header with city visual and overlay
    const CardHeader = ({ city, days }: { city: string; days: number }) => {
        const gradient = getCityGradient(city);
        const cityInitial = city.charAt(0).toUpperCase();

        return (
            <div className={cn("w-full h-full bg-gradient-to-br", gradient, "relative overflow-hidden")}>
                {/* Decorative map pattern overlay */}
                <div className="absolute inset-0 opacity-10">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
                        <defs>
                            <pattern id={`map-${city}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                                <circle cx="2" cy="2" r="1" fill="currentColor" />
                                <circle cx="10" cy="10" r="1.5" fill="currentColor" />
                                <path d="M2 2 L10 10" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2" />
                            </pattern>
                        </defs>
                        <rect width="100" height="100" fill={`url(#map-${city})`} className="text-white" />
                    </svg>
                </div>

                {/* City initial as large background element */}
                <div className="absolute -right-4 -bottom-4 text-8xl font-bold text-white/10 select-none">
                    {cityInitial}
                </div>

                {/* Overlay with city name */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-3 right-12">
                    <span className="text-white text-sm font-medium drop-shadow-lg truncate block">
                        {getDisplayCity(city).split(",")[0]}
                    </span>
                </div>

                {/* Days badge */}
                <div className="absolute bottom-2 right-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-black/70 text-white backdrop-blur-sm">
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
                                {/* Mini thumbnail */}
                                <div className="h-16 w-16 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-violet-200 dark:ring-violet-800">
                                    <div className={cn("w-full h-full bg-gradient-to-br relative", getCityGradient(filteredItineraries[0].city || "Trip"))}>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-2xl font-bold text-white/80">
                                                {(filteredItineraries[0].city || "T").charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
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
                                    "group overflow-hidden transition-all hover:shadow-lg border-border/50",
                                    viewMode === "list" ? "flex flex-row" : "flex flex-col"
                                )}
                            >
                                {/* Enhanced Thumbnail with City Visual */}
                                <div
                                    className={cn(
                                        "relative overflow-hidden flex-shrink-0",
                                        viewMode === "grid" ? "h-36" : "w-36 min-h-[120px]"
                                    )}
                                >
                                    <CardHeader city={displayCity} days={itinerary.days} />
                                </div>

                                {/* Content - streamlined since city is in header */}
                                <div className={cn(
                                    "flex-1 flex flex-col min-w-0",
                                    viewMode === "list" ? "p-4" : "p-4"
                                )}>
                                    <Link href={`/itineraries/${itinerary.id}`} className="block flex-1">
                                        <h3 className="font-semibold text-base leading-snug line-clamp-2 group-hover:text-violet-600 transition-colors mb-2">
                                            {cleanedTitle}
                                        </h3>

                                        <div className="flex items-center gap-2 mb-2">
                                            <LocalScoreBadge score={itinerary.local_score} />
                                        </div>
                                    </Link>

                                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/30">
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <Clock className="h-3 w-3" />
                                            {new Date(itinerary.created_at).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                            })}
                                        </div>

                                        {/* Actions Menu */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => e.preventDefault()}
                                                    aria-label={`Actions for ${cleanedTitle}`}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => handleDuplicate(itinerary)}
                                                    disabled={duplicateMutation.isPending}
                                                >
                                                    <Copy className="h-4 w-4 mr-2" />
                                                    {duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleShare(itinerary)}>
                                                    <Share2 className="h-4 w-4 mr-2" />
                                                    Share
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={() => setDeleteId(itinerary.id)}
                                                >
                                                    <Trash2 className="h-4 w-4 mr-2" />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}

                    {/* Add New Card - at the end (Grid view only) */}
                    {viewMode === "grid" && (
                        <Link href="/itineraries/new">
                            <Card className="min-h-[200px] border border-dashed border-violet-300 dark:border-violet-700 hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all cursor-pointer flex items-center justify-center group">
                                <div className="text-center p-6">
                                    <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-3 group-hover:bg-violet-200 dark:group-hover:bg-violet-900/50 transition-colors">
                                        <Plus className="h-6 w-6 text-violet-600" />
                                    </div>
                                    <p className="text-base font-medium text-muted-foreground group-hover:text-violet-600 transition-colors">
                                        Create New Itinerary
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
