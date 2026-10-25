"use client";

import { useState, useEffect, useRef } from "react";
import { useSubscription } from "@/hooks/use-subscription";
import type { SubscriptionTier } from "@/lib/subscription";

interface PlacePhotoResult {
    photoUrl: string | null;
    rating: number | null;
    totalRatings: number | null;
    phone: string | null;
    placeId: string | null;
    formattedAddress: string | null;
    lat: number | null;
    lng: number | null;
    isLoading: boolean;
}

const EMPTY_RESULT: PlacePhotoResult = {
    photoUrl: null,
    rating: null,
    totalRatings: null,
    phone: null,
    placeId: null,
    formattedAddress: null,
    lat: null,
    lng: null,
    isLoading: false,
};

// Client-side cache to avoid re-fetches within the same session
const photoCache = new Map<string, PlacePhotoResult>();

type PlacePhotoData = Partial<Omit<PlacePhotoResult, "isLoading">> | null;
type Pending = { query: string; city: string; waiters: ((data: PlacePhotoData) => void)[] };

// Every card of a screen asks in the same commit: collect the lookups and send ONE request
// (POST /api/places/photos, max 12 per request) instead of one request per card.
const BATCH_MAX = 12;
let pending = new Map<string, Pending>();
let flushQueued = false;

async function sendBatch(batch: Pending[]) {
    let results: PlacePhotoData[] = [];
    try {
        const res = await fetch("/api/places/photos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: batch.map(({ query, city }) => ({ query, city })) }),
        });
        const body = res.ok ? await res.json() : null;
        results = Array.isArray(body?.results) ? body.results : [];
    } catch {
        results = [];
    }
    batch.forEach((entry, i) => entry.waiters.forEach((resolve) => resolve(results[i] ?? null)));
}

function flush() {
    flushQueued = false;
    const entries = [...pending.values()];
    pending = new Map();
    for (let i = 0; i < entries.length; i += BATCH_MAX) void sendBatch(entries.slice(i, i + BATCH_MAX));
}

function requestPlacePhoto(key: string, query: string, city: string): Promise<PlacePhotoData> {
    return new Promise((resolve) => {
        const entry = pending.get(key) ?? { query, city, waiters: [] };
        entry.waiters.push(resolve);
        pending.set(key, entry);
        if (!flushQueued) {
            flushQueued = true;
            queueMicrotask(flush);
        }
    });
}

/**
 * Hook to fetch place photo + metadata from Google Places API.
 * Fetches when an activity has no stored image so itinerary stops can still
 * show the real place when Google has a confident match.
 */
export function usePlacePhoto(
    activityName: string,
    city: string,
    options: {
        existingImage?: string;
        userTier?: SubscriptionTier;
        enabled?: boolean;
        includeDetails?: boolean;
    } = {}
): PlacePhotoResult {
    const { tier } = useSubscription();
    const { existingImage, userTier = tier, enabled = true, includeDetails = false } = options;

    const shouldFetch = (tier === "pro" || tier === "premium") && (userTier === "pro" || userTier === "premium") && enabled && (!!includeDetails || !existingImage) && !!activityName;
    const cacheKey = `${activityName}:${city}`;

    // Check cache synchronously on render
    const cached = shouldFetch ? photoCache.get(cacheKey) : undefined;

    const [fetchResult, setFetchResult] = useState<{ key: string; value: PlacePhotoResult } | null>(null);
    const fetchedKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!shouldFetch || cached || fetchedKeyRef.current === cacheKey) return;

        fetchedKeyRef.current = cacheKey;
        let mounted = true;

        requestPlacePhoto(cacheKey, activityName, city)
            .then((data) => {
                if (!mounted) return;
                const newResult: PlacePhotoResult = {
                    photoUrl: data?.photoUrl || null,
                    rating: data?.rating || null,
                    totalRatings: data?.totalRatings || null,
                    phone: data?.phone || null,
                    placeId: data?.placeId || null,
                    formattedAddress: data?.formattedAddress || null,
                    lat: typeof data?.lat === "number" ? data.lat : null,
                    lng: typeof data?.lng === "number" ? data.lng : null,
                    isLoading: false,
                };
                if (data) photoCache.set(cacheKey, newResult);
                setFetchResult({ key: cacheKey, value: newResult });
            })
            .catch(() => {
                if (!mounted) return;
                setFetchResult({ key: cacheKey, value: EMPTY_RESULT });
            });

        return () => {
            mounted = false;
            if (fetchedKeyRef.current === cacheKey) fetchedKeyRef.current = null;
        };
    }, [shouldFetch, activityName, city, cacheKey, cached]);

    // Priority: cached sync > fetch result > loading/empty
    if (cached) return cached;
    if (shouldFetch && fetchResult?.key === cacheKey) return fetchResult.value;
    if (shouldFetch && !cached) return { ...EMPTY_RESULT, isLoading: true };
    return EMPTY_RESULT;
}
