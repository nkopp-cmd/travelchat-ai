"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    MapPin,
    Calendar,
    Star,
    Eye,
    Heart,
    Copy,
    ExternalLink,
    Sparkles,
    TrendingUp,
    Clock,
    Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LikeButton } from "@/components/itineraries/like-button";

interface PublicItinerary {
    id: string;
    title: string;
    city: string;
    days: number;
    localScore: number;
    highlights: string[];
    shareCode: string;
    createdAt: string;
    viewCount: number;
    likeCount: number;
    creatorName: string | null;
    creatorAvatar: string | null;
}

interface ExploreContentProps {
    itineraries: PublicItinerary[];
    popularCities: string[];
    currentCity?: string;
    currentDuration?: string;
    currentSort: string;
}

const DURATION_OPTIONS = [
    { value: "all", label: "Any Duration" },
    { value: "1", label: "1 Day" },
    { value: "2-3", label: "2-3 Days" },
    { value: "4-7", label: "4-7 Days" },
    { value: "8+", label: "Week+" },
];

const SORT_OPTIONS = [
    { value: "recent", label: "Most Recent", icon: Clock },
    { value: "popular", label: "Most Viewed", icon: Eye },
    { value: "likes", label: "Most Liked", icon: Heart },
    { value: "score", label: "Highest Score", icon: Star },
];

export function ExploreContent({
    itineraries,
    popularCities,
    currentCity,
    currentDuration,
    currentSort,
}: ExploreContentProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [selectedCity, setSelectedCity] = useState(currentCity || "all");
    const [selectedDuration, setSelectedDuration] = useState(currentDuration || "all");
    const [selectedSort, setSelectedSort] = useState(currentSort);

    const updateFilters = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === "all") {
            params.delete(key);
        } else {
            params.set(key, value);
        }
        router.push(`/explore?${params.toString()}`);
    };

    const handleCityChange = (value: string) => {
        setSelectedCity(value);
        updateFilters("city", value);
    };

    const handleDurationChange = (value: string) => {
        setSelectedDuration(value);
        updateFilters("duration", value);
    };

    const handleSortChange = (value: string) => {
        setSelectedSort(value);
        updateFilters("sort", value);
    };

    const handleDuplicate = async (itinerary: PublicItinerary) => {
        try {
            const response = await fetch(`/api/itineraries/${itinerary.id}/duplicate`, {
                method: "POST",
            });

            if (response.status === 401) {
                toast({
                    title: "Sign in required",
                    description: "Please sign in to save this itinerary to your account.",
                    variant: "default",
                });
                router.push("/sign-in");
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to duplicate");
            }

            const data = await response.json();
            toast({
                title: "Itinerary saved!",
                description: "The itinerary has been added to your collection.",
            });
            router.push(`/itineraries/${data.id}`);
        } catch {
            toast({
                title: "Error",
                description: "Failed to save itinerary. Please try again.",
                variant: "destructive",
            });
        }
    };

    const getScoreLabel = (score: number) => {
        if (score >= 8) return { label: "Hidden Gem", color: "bg-violet-500" };
        if (score >= 6) return { label: "Local Favorite", color: "bg-indigo-500" };
        if (score >= 4) return { label: "Off the Path", color: "bg-blue-500" };
        return { label: "Mixed", color: "bg-gray-500" };
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Filters:</span>
                </div>

                {/* City Filter */}
                <Select value={selectedCity} onValueChange={handleCityChange}>
                    <SelectTrigger className="w-[160px]">
                        <MapPin className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="All Cities" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Cities</SelectItem>
                        {popularCities.map((city) => (
                            <SelectItem key={city} value={city}>
                                {city}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Duration Filter */}
                <Select value={selectedDuration} onValueChange={handleDurationChange}>
                    <SelectTrigger className="w-[140px]">
                        <Calendar className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Duration" />
                    </SelectTrigger>
                    <SelectContent>
                        {DURATION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Sort */}
                <Select value={selectedSort} onValueChange={handleSortChange}>
                    <SelectTrigger className="w-[160px]">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                        {SORT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                    <option.icon className="h-4 w-4" />
                                    {option.label}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Results count */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    {itineraries.length} {itineraries.length === 1 ? "itinerary" : "itineraries"} found
                </p>
            </div>

            {/* Itinerary Grid */}
            {itineraries.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {itineraries.map((itinerary) => {
                        const scoreInfo = getScoreLabel(itinerary.localScore);

                        return (
                            <Card
                                key={itinerary.id}
                                className="!py-0 !gap-0 group overflow-hidden hover:shadow-lg transition-all duration-300 border-border/40"
                            >
                                {/* Card Header with gradient */}
                                <CardHeader className="relative bg-gradient-to-br from-violet-500 to-indigo-600 text-white p-5">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1 flex-1 pr-4">
                                            <h3 className="font-bold text-lg line-clamp-2 group-hover:underline">
                                                <Link href={`/shared/${itinerary.shareCode}`}>
                                                    {itinerary.title}
                                                </Link>
                                            </h3>
                                            <div className="flex items-center gap-2 text-violet-100">
                                                <MapPin className="h-4 w-4" />
                                                <span>{itinerary.city}</span>
                                            </div>
                                        </div>
                                        {itinerary.localScore > 0 && (
                                            <Badge className={cn("text-white shrink-0", scoreInfo.color)}>
                                                <Star className="h-3 w-3 mr-1 fill-current" />
                                                {itinerary.localScore}
                                            </Badge>
                                        )}
                                    </div>
                                </CardHeader>

                                <CardContent className="p-5 space-y-4">
                                    {/* Stats */}
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-4 w-4" />
                                            <span>{itinerary.days} {itinerary.days === 1 ? "day" : "days"}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Eye className="h-4 w-4" />
                                            <span>{itinerary.viewCount}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Heart className="h-4 w-4" />
                                            <span>{itinerary.likeCount}</span>
                                        </div>
                                    </div>

                                    {/* Highlights */}
                                    {itinerary.highlights.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                                <Sparkles className="h-3 w-3" />
                                                Highlights
                                            </div>
                                            <ul className="space-y-1">
                                                {itinerary.highlights.slice(0, 3).map((highlight, i) => (
                                                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                                        <span className="text-violet-500 mt-1">•</span>
                                                        <span className="line-clamp-1">{highlight}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </CardContent>

                                <CardFooter className="p-5 pt-0 flex items-center justify-between">
                                    {/* Creator info */}
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-6 w-6">
                                            <AvatarImage src={itinerary.creatorAvatar || undefined} />
                                            <AvatarFallback className="text-xs">
                                                {itinerary.creatorName?.[0]?.toUpperCase() || "?"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="text-xs text-muted-foreground">
                                            <span>{itinerary.creatorName || "Anonymous"}</span>
                                            <span className="mx-1">•</span>
                                            <span>{formatDate(itinerary.createdAt)}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                        <LikeButton
                                            itineraryId={itinerary.id}
                                            initialCount={itinerary.likeCount}
                                            size="sm"
                                            showCount={false}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => handleDuplicate(itinerary)}
                                            title="Save to my itineraries"
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Link href={`/shared/${itinerary.shareCode}`}>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                title="View itinerary"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        </Link>
                                    </div>
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                        <MapPin className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No itineraries found</h3>
                    <p className="text-muted-foreground mb-4">
                        Try adjusting your filters or be the first to share an itinerary!
                    </p>
                    <Link href="/itineraries/new">
                        <Button className="bg-gradient-to-r from-violet-600 to-indigo-600">
                            <Sparkles className="mr-2 h-4 w-4" />
                            Create an Itinerary
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
