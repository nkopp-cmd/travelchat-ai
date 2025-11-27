"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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
    Star,
    Grid3X3,
    List,
    SlidersHorizontal,
    Sparkles,
    Plus,
    Clock,
    CheckCircle2,
    FileEdit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCityThumbnail } from "@/lib/activity-images";

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
    activities?: Array<{
        name: string;
        thumbnail?: string;
    }>;
}

interface ItineraryListProps {
    initialItineraries: Itinerary[];
}

type SortOption = "newest" | "oldest" | "score" | "alphabetical" | "days";
type ViewMode = "grid" | "list";

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
                    i.city.toLowerCase().includes(query) ||
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
                    text: `Check out my ${itinerary.days}-day itinerary for ${itinerary.city}!`,
                    url,
                });
            } catch {
                // User cancelled or error
            }
        } else {
            await navigator.clipboard.writeText(url);
            // Could add a toast notification here
        }
    };

    const getStatusIcon = (status?: string) => {
        switch (status) {
            case "completed":
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case "draft":
                return <FileEdit className="h-4 w-4 text-amber-500" />;
            default:
                return null;
        }
    };

    const LocalScoreMeter = ({ score }: { score: number }) => (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                            {[...Array(5)].map((_, i) => (
                                <Star
                                    key={i}
                                    className={cn(
                                        "h-3.5 w-3.5",
                                        i < Math.round(score / 2)
                                            ? "text-amber-400 fill-amber-400"
                                            : "text-muted-foreground/30"
                                    )}
                                />
                            ))}
                        </div>
                        <span className="text-xs font-medium">{score}/10</span>
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-sm">
                        <strong>Local Score:</strong> How &quot;off the beaten path&quot; this itinerary is.
                        <br />
                        Higher scores mean more hidden gems and fewer tourist traps.
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
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
                    {/* Add New Card (Grid view only) */}
                    {viewMode === "grid" && (
                        <Link href="/itineraries/new">
                            <Card className="h-full min-h-[280px] border-2 border-dashed hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20 transition-all cursor-pointer flex items-center justify-center group">
                                <div className="text-center">
                                    <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-3 group-hover:bg-violet-200 dark:group-hover:bg-violet-900/50 transition-colors">
                                        <Plus className="h-6 w-6 text-violet-600" />
                                    </div>
                                    <p className="font-medium text-muted-foreground group-hover:text-violet-600 transition-colors">
                                        Create New Itinerary
                                    </p>
                                </div>
                            </Card>
                        </Link>
                    )}

                    {filteredItineraries.map((itinerary) => (
                        <Card
                            key={itinerary.id}
                            className={cn(
                                "group overflow-hidden transition-all hover:shadow-lg",
                                viewMode === "list" ? "flex flex-row" : "flex flex-col h-full"
                            )}
                        >
                            {/* Thumbnail */}
                            <div
                                className={cn(
                                    "relative bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30",
                                    viewMode === "grid" ? "h-32" : "w-32 h-24 flex-shrink-0"
                                )}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={getCityThumbnail(itinerary.city)}
                                    alt={itinerary.city}
                                    className="w-full h-full object-cover"
                                />
                                {/* Status badge */}
                                {itinerary.status && (
                                    <div className="absolute top-2 left-2">
                                        <span
                                            className={cn(
                                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                                itinerary.status === "completed"
                                                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                                                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                                            )}
                                        >
                                            {getStatusIcon(itinerary.status)}
                                            {itinerary.status === "completed" ? "Completed" : "Draft"}
                                        </span>
                                    </div>
                                )}
                                {/* Days badge */}
                                <div className="absolute bottom-2 right-2">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-black/60 text-white backdrop-blur-sm">
                                        <Calendar className="h-3 w-3" />
                                        {itinerary.days} {itinerary.days === 1 ? "Day" : "Days"}
                                    </span>
                                </div>
                            </div>

                            {/* Content */}
                            <div className={cn("flex-1 flex flex-col", viewMode === "list" ? "p-3" : "")}>
                                <Link href={`/itineraries/${itinerary.id}`} className="flex-1">
                                    <CardContent className={cn("pt-4", viewMode === "list" && "p-0 pt-0")}>
                                        <h3 className="font-semibold line-clamp-1 group-hover:text-violet-600 transition-colors">
                                            {itinerary.title}
                                        </h3>
                                        {itinerary.subtitle && (
                                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                                {itinerary.subtitle}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <Map className="h-3.5 w-3.5" />
                                                <span>{itinerary.city}</span>
                                            </div>
                                            <LocalScoreMeter score={itinerary.local_score || 0} />
                                        </div>
                                    </CardContent>
                                </Link>

                                <CardFooter
                                    className={cn(
                                        "flex items-center justify-between pt-0",
                                        viewMode === "list" && "p-0 pt-2"
                                    )}
                                >
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        {new Date(itinerary.created_at).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                        })}
                                    </div>

                                    {/* Actions Menu */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                </CardFooter>
                            </div>
                        </Card>
                    ))}
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
