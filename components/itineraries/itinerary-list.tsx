"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    Map,
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
    MapPin,
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
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [filterDays, setFilterDays] = useState<string>("all");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Get unique day counts for filter
    const dayOptions = useMemo(() => {
        const days = [...new Set(itineraries.map((i) => i.days))].sort((a, b) => a - b);
        return days;
    }, [itineraries]);

    // Filter and sort itineraries
    const filteredItineraries = useMemo(() => {
        let result = [...itineraries];

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
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
    }, [itineraries, searchQuery, sortBy, filterDays]);

    const handleDuplicate = async (itinerary: Itinerary) => {
        try {
            const response = await fetch(`/api/itineraries/${itinerary.id}/duplicate`, {
                method: "POST",
            });
            if (response.ok) {
                const newItinerary = await response.json();
                setItineraries((prev) => [newItinerary, ...prev]);
            }
        } catch (error) {
            console.error("Failed to duplicate:", error);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/itineraries/${deleteId}`, {
                method: "DELETE",
            });
            if (response.ok) {
                setItineraries((prev) => prev.filter((i) => i.id !== deleteId));
            }
        } catch (error) {
            console.error("Failed to delete:", error);
        } finally {
            setIsDeleting(false);
            setDeleteId(null);
        }
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

    // Placeholder component for missing images
    const ImagePlaceholder = ({ city }: { city: string }) => (
        <div className="w-full h-full bg-gradient-to-br from-violet-200 via-indigo-200 to-purple-200 dark:from-violet-900/50 dark:via-indigo-900/50 dark:to-purple-900/50 flex items-center justify-center">
            <div className="text-center">
                <MapPin className="h-8 w-8 text-violet-400 dark:text-violet-500 mx-auto mb-1" />
                <span className="text-xs text-violet-500 dark:text-violet-400 font-medium">
                    {getDisplayCity(city).split(",")[0]}
                </span>
            </div>
        </div>
    );

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
            {/* Search and Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or destination..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="flex gap-2">
                    <Select value={filterDays} onValueChange={setFilterDays}>
                        <SelectTrigger className="w-[130px]">
                            <SlidersHorizontal className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Duration" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Durations</SelectItem>
                            {dayOptions.map((days) => (
                                <SelectItem key={days} value={days.toString()}>
                                    {days} {days === 1 ? "Day" : "Days"}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">Newest First</SelectItem>
                            <SelectItem value="oldest">Oldest First</SelectItem>
                            <SelectItem value="score">Highest Score</SelectItem>
                            <SelectItem value="alphabetical">A-Z</SelectItem>
                            <SelectItem value="days">Duration</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex border rounded-md">
                        <Button
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            size="icon"
                            className="rounded-r-none"
                            onClick={() => setViewMode("grid")}
                        >
                            <Grid3X3 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === "list" ? "secondary" : "ghost"}
                            size="icon"
                            className="rounded-l-none"
                            onClick={() => setViewMode("list")}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

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
                                {/* Thumbnail */}
                                <div
                                    className={cn(
                                        "relative overflow-hidden flex-shrink-0",
                                        viewMode === "grid" ? "h-32" : "w-32 min-h-[120px]"
                                    )}
                                >
                                    <ImagePlaceholder city={displayCity} />

                                    {/* Days badge - bottom right */}
                                    <div className="absolute bottom-2 right-2">
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-black/70 text-white backdrop-blur-sm">
                                            <Calendar className="h-3 w-3" />
                                            {itinerary.days} {itinerary.days === 1 ? "day" : "days"}
                                        </span>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className={cn(
                                    "flex-1 flex flex-col min-w-0",
                                    viewMode === "list" ? "p-4" : "p-4"
                                )}>
                                    <Link href={`/itineraries/${itinerary.id}`} className="block">
                                        <h3 className="font-semibold text-base leading-snug line-clamp-2 group-hover:text-violet-600 transition-colors mb-2">
                                            {cleanedTitle}
                                        </h3>

                                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                                            <Map className="h-4 w-4 flex-shrink-0" />
                                            <span className="truncate">{displayCity}</span>
                                        </div>

                                        <div className="mb-3">
                                            <LocalScoreBadge score={itinerary.local_score} />
                                        </div>
                                    </Link>

                                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/30">
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
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => handleDuplicate(itinerary)}>
                                                    <Copy className="h-4 w-4 mr-2" />
                                                    Duplicate
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
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
