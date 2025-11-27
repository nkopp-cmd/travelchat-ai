"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SpotFilters, FilterState } from "@/components/spots/spot-filters";

interface SpotsFiltersWrapperProps {
    categories: string[];
}

export function SpotsFiltersWrapper({ categories }: SpotsFiltersWrapperProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleSearch = (query: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (query) {
            params.set("search", query);
        } else {
            params.delete("search");
        }
        router.push(`/spots?${params.toString()}`);
    };

    const handleFilterChange = (filters: FilterState) => {
        const params = new URLSearchParams(searchParams.toString());

        // Update category
        if (filters.category && filters.category !== "all") {
            params.set("category", filters.category);
        } else {
            params.delete("category");
        }

        // Update score
        if (filters.localleyScore && filters.localleyScore !== "all") {
            params.set("score", filters.localleyScore);
        } else {
            params.delete("score");
        }

        // Update sort
        if (filters.sortBy) {
            params.set("sort", filters.sortBy);
        } else {
            params.delete("sort");
        }

        router.push(`/spots?${params.toString()}`);
    };

    return (
        <SpotFilters
            categories={categories}
            onSearch={handleSearch}
            onFilterChange={handleFilterChange}
        />
    );
}
