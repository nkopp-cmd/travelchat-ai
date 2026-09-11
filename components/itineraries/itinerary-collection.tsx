"use client";

import { useState, useMemo, useDeferredValue, useRef, useEffect, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export interface CollectionItinerary {
    id: string;
    title: string | null;
    subtitle?: string | null;
    city: string | null;
    days: number;
    local_score: number | null;
    created_at: string;
    status?: string | null;
    is_favorite?: boolean;
}

export interface CollectionLinkProps {
    href: string;
    className?: string;
    children: ReactNode;
}

export interface ItineraryCollectionProps {
    itineraries: CollectionItinerary[];
    Link: ComponentType<CollectionLinkProps>;
    renderImage?: (city: string, sizes: string) => ReactNode;
    onDelete: (id: string) => Promise<void>;
    onDuplicate?: (itinerary: CollectionItinerary) => void;
    onShare?: (itinerary: CollectionItinerary) => void;
    duplicatePending?: boolean;
    canCreate?: boolean;
    loadedOnly?: boolean;
}

type SortOption = "newest" | "oldest" | "score" | "alphabetical" | "days";
type ViewMode = "grid" | "list";

// Clean up title - remove AI chat-style prefixes
function cleanTitle(title: string | null): string {
    if (!title?.trim()) return "Untitled itinerary";
    // Remove common AI chat prefixes
    const prefixes = [
        /^(Oh,?\s*)?[A-Za-z]+[—–-]\s*nice pick!?\s*/i,
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
        return "City not specified";
    }
    return city;
}

export function ItineraryCollection({ itineraries, Link, renderImage, onDelete, onDuplicate, onShare,
    duplicatePending = false, canCreate = false, loadedOnly = false }: ItineraryCollectionProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [sortBy, setSortBy] = useState<SortOption>("newest");
    const [filterDays, setFilterDays] = useState<string>("all");
    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deletePending, setDeletePending] = useState(false);
    const deleteLock = useRef(false);
    const actionTrigger = useRef<HTMLButtonElement | null>(null);
    const collectionElement = useRef<HTMLDivElement | null>(null);
    const lifetime = useRef<AbortController | null>(null);
    const [deleteError, setDeleteError] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        return () => controller.abort();
    }, []);

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
                    i.title?.toLowerCase().includes(query) ||
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
                result.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
                break;
            case "days":
                result.sort((a, b) => b.days - a.days);
                break;
        }

        return result;
    }, [itineraries, deferredSearchQuery, sortBy, filterDays]);

    const handleDelete = async () => {
        if (!deleteId || deleteLock.current) return;
        deleteLock.current = true;
        setDeletePending(true);
        setDeleteError(false);
        const signal = lifetime.current?.signal;
        try {
            await onDelete(deleteId);
        } catch {
            if (!signal?.aborted) setDeleteError(true);
        } finally {
            if (!signal?.aborted) {
                setDeleteId(null);
                setDeletePending(false);
                deleteLock.current = false;
            }
        }
    };

    const LocalScoreBadge = ({ score }: { score: number | null }) => (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                        <Gem className="h-3 w-3" />
                        <span className="text-xs font-semibold">{score == null ? "Not scored" : `${score}/10`}</span>
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

    // Enhanced card header with city image or gradient fallback
    const CardHeader = ({ city, days }: { city: string; days: number }) => {
        const gradient = getCityGradient(city);
        const image = renderImage?.(city, "(max-width: 768px) 100vw, 400px");

        return (
            <div className="w-full h-full relative overflow-hidden bg-muted">
                {image ?? (
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
            <div ref={collectionElement} tabIndex={-1} aria-label="Itinerary collection" className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl bg-white/50 dark:bg-white/5 backdrop-blur-sm border-black/10 dark:border-white/10">
                <div className="h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-violet-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{loadedOnly ? "No trips in loaded pages" : "No itineraries yet"}</h3>
                {loadedOnly && <p role="status">Search, filters, and sorting apply to loaded trips only. Load more to check remaining trips.</p>}
                {canCreate && <p className="text-muted-foreground mb-6 text-center max-w-md">
                    Start planning your next adventure with AI-powered recommendations for hidden gems and local favorites
                </p>}
                {canCreate && <Link href="/itineraries/new">
                    <Button className="bg-violet-600 hover:bg-violet-700">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Create Your First Itinerary
                    </Button>
                </Link>}
            </div>
        );
    }

    return (
        <div ref={collectionElement} tabIndex={-1} aria-label="Itinerary collection" className="space-y-6">
            {deleteError && <p role="alert">Could not delete itinerary. Please try again.</p>}
            {loadedOnly && <p role="status">Search, filters, and sorting apply to loaded trips only.</p>}
            {/* Simplified Search and Controls Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Search - standalone and prominent */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        aria-label={loadedOnly ? "Search loaded trips" : "Search itineraries"}
                        placeholder={loadedOnly ? "Search loaded trips..." : "Search itineraries..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-white/50 dark:bg-white/5 border-black/5 dark:border-white/10"
                    />
                </div>

                {/* Compact Controls Group */}
                <div className="flex items-center gap-2">
                    {/* Filters Dropdown - combines duration filter and sort */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2" aria-label="Filters">
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
                        <Card className="!py-0 !gap-0 overflow-hidden border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-md hover:shadow-lg hover:shadow-violet-500/10 hover:border-violet-300/50 dark:hover:border-violet-700/50 transition-all group">
                            <div className="flex items-center gap-4 p-4">
                                {/* Mini thumbnail with city image */}
                                <div className="h-16 w-16 rounded-xl overflow-hidden flex-shrink-0 ring-2 ring-violet-200 dark:ring-violet-800 relative">
                                    {renderImage?.(filteredItineraries[0].city || "", "64px") ?? (
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
                                        {getDisplayCity(filteredItineraries[0].city)} • {filteredItineraries[0].days} {filteredItineraries[0].days === 1 ? "day" : "days"}
                                    </p>
                                </div>
                                {/* Continue button */}
                                <span className="inline-flex rounded-md px-3 py-2 text-sm text-white bg-violet-600 group-hover:bg-violet-700 flex-shrink-0">
                                    Continue
                                </span>
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
                                    "!py-0 !gap-0 group overflow-hidden relative",
                                    "bg-white/70 dark:bg-white/5 backdrop-blur-md",
                                    "border border-black/5 dark:border-white/10",
                                    "transition-all duration-300 ease-out",
                                    "hover:shadow-xl hover:shadow-violet-500/10",
                                    "hover:border-violet-400/50 dark:hover:border-violet-500/40",
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
                                            {Number.isNaN(Date.parse(itinerary.created_at)) ? "Date unavailable" : new Date(itinerary.created_at).toLocaleDateString("en-US", {
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
                                                    className="h-7 w-7 transition-all duration-200 absolute right-3 bottom-3 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                                                    onPointerDown={(e) => { actionTrigger.current = e.currentTarget; }}
                                                    onKeyDown={(e) => { actionTrigger.current = e.currentTarget; }}
                                                    onClick={(e) => e.preventDefault()}
                                                    aria-label={`Actions for ${cleanedTitle}`}
                                                >
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48" onCloseAutoFocus={(event) => { if (deleteId) event.preventDefault(); }}>
                                                {onDuplicate && <DropdownMenuItem
                                                    onClick={() => onDuplicate(itinerary)}
                                                    disabled={duplicatePending}
                                                    className="gap-2"
                                                >
                                                    <Copy className="h-4 w-4" />
                                                    {duplicatePending ? "Duplicating..." : "Duplicate"}
                                                </DropdownMenuItem>}
                                                {onShare && <DropdownMenuItem onClick={() => onShare(itinerary)} className="gap-2">
                                                    <Share2 className="h-4 w-4" />
                                                    Share
                                                </DropdownMenuItem>}
                                                {(onShare || onDuplicate) && <DropdownMenuSeparator />}
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive gap-2"
                                                    onClick={() => setDeleteId(itinerary.id)} disabled={deletePending}
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
                    {canCreate && viewMode === "grid" && (
                        <Link href="/itineraries/new">
                            <Card className={cn(
                                "!py-0 !gap-0 min-h-[240px] relative overflow-hidden",
                                "border-2 border-dashed border-violet-300/50 dark:border-violet-700/50",
                                "bg-white/50 dark:bg-white/5 backdrop-blur-md",
                                "hover:border-violet-400/70 dark:hover:border-violet-500/70",
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
            <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open && !deleteLock.current) setDeleteId(null); }}>
                <AlertDialogContent onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    const target = actionTrigger.current?.isConnected ? actionTrigger.current : collectionElement.current;
                    target?.focus();
                }}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Itinerary?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete &quot;{cleanTitle(itineraries.find((itinerary) => itinerary.id === deleteId)?.title ?? null)}&quot; and all its activities. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => { event.preventDefault(); void handleDelete(); }}
                            disabled={deletePending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deletePending ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
