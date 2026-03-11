"use client";

import { useState, useEffect, useRef } from "react";
import type { SubscriptionTier } from "@/lib/subscription";

interface PlacePhotoResult {
    photoUrl: string | null;
    rating: number | null;
    totalRatings: number | null;
    phone: string | null;
    isLoading: boolean;
}

const EMPTY_RESULT: PlacePhotoResult = {
    photoUrl: null,
    rating: null,
    totalRatings: null,
    phone: null,
    isLoading: false,
};

// Client-side cache to avoid re-fetches within the same session
const photoCache = new Map<string, PlacePhotoResult>();

/**
 * Hook to fetch place photo + metadata from Google Places API.
 * Only fetches for Pro/Premium users when activity.image is missing.
 */
export function usePlacePhoto(
    activityName: string,
    city: string,
    options: {
        existingImage?: string;
        userTier?: SubscriptionTier;
        enabled?: boolean;
    } = {}
): PlacePhotoResult {
    const { existingImage, userTier = "free", enabled = true } = options;

    const shouldFetch = enabled && !existingImage && (userTier === "pro" || userTier === "premium") && !!activityName;
    const cacheKey = `${activityName}:${city}`;

    // Check cache synchronously on render
    const cached = shouldFetch ? photoCache.get(cacheKey) : undefined;

    const [fetchResult, setFetchResult] = useState<PlacePhotoResult | null>(null);
    const fetchedKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!shouldFetch || cached || fetchedKeyRef.current === cacheKey) return;

        fetchedKeyRef.current = cacheKey;
        let mounted = true;

        fetch(`/api/places/photos?query=${encodeURIComponent(activityName)}&city=${encodeURIComponent(city)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!mounted) return;
                const newResult: PlacePhotoResult = {
                    photoUrl: data?.photoUrl || null,
                    rating: data?.rating || null,
                    totalRatings: data?.totalRatings || null,
                    phone: data?.phone || null,
                    isLoading: false,
                };
                photoCache.set(cacheKey, newResult);
                setFetchResult(newResult);
            })
            .catch(() => {
                if (!mounted) return;
                setFetchResult(EMPTY_RESULT);
            });

        return () => {
            mounted = false;
        };
    }, [shouldFetch, activityName, city, cacheKey, cached]);

    // Priority: cached sync > fetch result > loading/empty
    if (cached) return cached;
    if (fetchResult) return fetchResult;
    if (shouldFetch && !cached) return { ...EMPTY_RESULT, isLoading: true };
    return EMPTY_RESULT;
}
