"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Search, SlidersHorizontal, X } from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

interface SpotFiltersProps {
    onSearch: (query: string) => void;
    onFilterChange: (filters: FilterState) => void;
    categories?: string[];
}

export interface FilterState {
    category: string;
    localleyScore: string;
    sortBy: string;
}

const LOCALLEY_SCORES = [
    { value: "all", label: "All Scores" },
    { value: "5", label: "Hidden Gem (5)" },
    { value: "4", label: "Local Favorite (4)" },
    { value: "3", label: "Mixed Crowd (3)" },
    { value: "2", label: "Tourist Friendly (2)" },
    { value: "1", label: "Tourist Spot (1)" },
];

const SORT_OPTIONS = [
    { value: "trending", label: "Trending" },
    { value: "score-high", label: "Highest Score" },
    { value: "score-low", label: "Lowest Score" },
    { value: "newest", label: "Newest" },
];

export function SpotFilters({ onSearch, onFilterChange, categories = [] }: SpotFiltersProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState<FilterState>({
        category: "all",
        localleyScore: "all",
        sortBy: "trending",
    });

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        onSearch(value);
    };

    const handleFilterChange = (key: keyof FilterState, value: string) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        onFilterChange(newFilters);
    };

    const clearFilters = () => {
        const defaultFilters: FilterState = {
            category: "all",
            localleyScore: "all",
            sortBy: "trending",
        };
        setFilters(defaultFilters);
        setSearchQuery("");
        onSearch("");
        onFilterChange(defaultFilters);
    };

    const hasActiveFilters =
        filters.category !== "all" ||
        filters.localleyScore !== "all" ||
        searchQuery !== "";

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search spots, neighborhoods, or vibes..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-10 pr-4 h-12 rounded-full border-border/40 bg-background/60 backdrop-blur-sm"
                />
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {/* Quick Sort */}
                <Select value={filters.sortBy} onValueChange={(value) => handleFilterChange("sortBy", value)}>
                    <SelectTrigger className="w-[160px] rounded-full border-border/40 bg-background/60 backdrop-blur-sm">
                        <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                        {SORT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Category Filter */}
                {categories.length > 0 && (
                    <Select value={filters.category} onValueChange={(value) => handleFilterChange("category", value)}>
                        <SelectTrigger className="w-[160px] rounded-full border-border/40 bg-background/60 backdrop-blur-sm">
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {categories.map((category) => (
                                <SelectItem key={category} value={category}>
                                    {category}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                {/* Advanced Filters Sheet */}
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-full gap-2">
                            <SlidersHorizontal className="h-4 w-4" />
                            Filters
                            {hasActiveFilters && (
                                <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                                    !
                                </Badge>
                            )}
                        </Button>
                    </SheetTrigger>
                    <SheetContent>
                        <SheetHeader>
                            <SheetTitle>Filter Spots</SheetTitle>
                            <SheetDescription>
                                Refine your search to find the perfect spot
                            </SheetDescription>
                        </SheetHeader>

                        <div className="mt-6 space-y-6">
                            {/* Localley Score Filter */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium">Localley Score</label>
                                <Select value={filters.localleyScore} onValueChange={(value) => handleFilterChange("localleyScore", value)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select score" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {LOCALLEY_SCORES.map((score) => (
                                            <SelectItem key={score.value} value={score.value}>
                                                {score.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Clear Filters */}
                            {hasActiveFilters && (
                                <Button
                                    variant="outline"
                                    onClick={clearFilters}
                                    className="w-full gap-2"
                                >
                                    <X className="h-4 w-4" />
                                    Clear All Filters
                                </Button>
                            )}
                        </div>
                    </SheetContent>
                </Sheet>

                {/* Active Filter Badges */}
                {hasActiveFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="rounded-full text-xs"
                    >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                    </Button>
                )}
            </div>

            {/* Active Filter Display */}
            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2">
                    {searchQuery && (
                        <Badge variant="secondary" className="gap-1">
                            Search: {searchQuery}
                            <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => handleSearchChange("")}
                            />
                        </Badge>
                    )}
                    {filters.category !== "all" && (
                        <Badge variant="secondary" className="gap-1">
                            {filters.category}
                            <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => handleFilterChange("category", "all")}
                            />
                        </Badge>
                    )}
                    {filters.localleyScore !== "all" && (
                        <Badge variant="secondary" className="gap-1">
                            Score: {filters.localleyScore}
                            <X
                                className="h-3 w-3 cursor-pointer"
                                onClick={() => handleFilterChange("localleyScore", "all")}
                            />
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}
