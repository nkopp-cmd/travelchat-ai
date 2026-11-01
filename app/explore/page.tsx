import { Suspense } from "react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { isPreviewItineraryListCandidate } from "@/lib/app-data/preview-itinerary-list";
import { previewPopularCities, previewPublicItineraries } from "@/lib/app-data/preview-explore";
import { headers } from "next/headers";
import { ExploreContent } from "./explore-content";
import { Skeleton } from "@/components/ui/skeleton";
import { AppBackground } from "@/components/layout/app-background";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Compass } from "@/components/ui/icons";

import type { Metadata } from "next";

export const metadata: Metadata = {
    alternates: { canonical: "/explore" },
    title: "Explore Itineraries - Community Travel Plans | Localley",
    description: "Discover community-created travel itineraries. Browse hidden gems, local favorites, and insider travel plans from travelers around the world.",
    keywords: "travel itineraries, trip plans, hidden gems, local spots, community travel, travel inspiration",
    openGraph: {
        title: "Explore Community Itineraries | Localley",
        description: "Browse travel itineraries created by our community. Find inspiration for your next adventure.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Explore Community Itineraries | Localley",
        description: "Browse travel itineraries created by our community. Find inspiration for your next adventure.",
    },
};

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

async function getPublicItineraries(
    city?: string,
    duration?: string,
    sortBy: string = "recent"
): Promise<PublicItinerary[]> {
    const supabase = createSupabaseAdmin();

    let query = supabase
        .from("itineraries")
        .select(`
            id,
            title,
            city,
            days,
            local_score,
            highlights,
            share_code,
            created_at,
            view_count,
            like_count,
            clerk_user_id
        `)
        .eq("shared", true)
        .not("share_code", "is", null);

    // Apply filters
    if (city && city !== "all") {
        query = query.ilike("city", `%${city}%`);
    }

    if (duration && duration !== "all") {
        switch (duration) {
            case "1":
                query = query.eq("days", 1);
                break;
            case "2-3":
                query = query.gte("days", 2).lte("days", 3);
                break;
            case "4-7":
                query = query.gte("days", 4).lte("days", 7);
                break;
            case "8+":
                query = query.gte("days", 8);
                break;
        }
    }

    // Apply sorting
    switch (sortBy) {
        case "popular":
            query = query.order("view_count", { ascending: false });
            break;
        case "likes":
            query = query.order("like_count", { ascending: false });
            break;
        case "score":
            query = query.order("local_score", { ascending: false });
            break;
        case "recent":
        default:
            query = query.order("created_at", { ascending: false });
            break;
    }

    query = query.limit(30);

    const { data, error } = await query;

    if (error) {
        console.error("Error fetching public itineraries:", error);
        return [];
    }

    // itineraries has no foreign key to users (the old embedded join failed with PGRST200 on every
    // request), so creators are looked up separately: one bounded query for this page's owners.
    const rows = data || [];
    const ownerIds = [...new Set(rows.map((item) => item.clerk_user_id).filter(Boolean))];
    const creators = new Map<string, string | null>();
    if (ownerIds.length > 0) {
        const { data: owners, error: ownersError } = await supabase
            .from("users")
            .select("clerk_id, username")
            .in("clerk_id", ownerIds);
        if (ownersError) console.error("Error fetching itinerary creators:", ownersError.code);
        for (const owner of owners || []) creators.set(owner.clerk_id, owner.username ?? null);
    }

    return rows.map((item) => ({
        id: item.id,
        title: item.title,
        city: item.city,
        days: item.days,
        localScore: item.local_score || 0,
        highlights: item.highlights || [],
        shareCode: item.share_code,
        createdAt: item.created_at,
        viewCount: item.view_count || 0,
        likeCount: item.like_count || 0,
        creatorName: creators.get(item.clerk_user_id) ?? null,
        // users has no avatar column; the card falls back to initials.
        creatorAvatar: null,
    }));
}

async function getPopularCities(): Promise<string[]> {
    const supabase = createSupabaseAdmin();

    const { data } = await supabase
        .from("itineraries")
        .select("city")
        .eq("shared", true)
        .not("share_code", "is", null);

    if (!data) return [];

    // Count cities and get top 10
    const cityCount: Record<string, number> = {};
    data.forEach((item) => {
        const city = item.city;
        cityCount[city] = (cityCount[city] || 0) + 1;
    });

    return Object.entries(cityCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([city]) => city);
}

export default async function ExplorePage({
    searchParams,
}: {
    searchParams: Promise<{ city?: string; duration?: string; sort?: string; data_candidate?: string }>;
}) {
    const params = await searchParams;
    // Candidate requests read only D1 and fail closed (no Supabase fallback).
    const candidate = isPreviewItineraryListCandidate((await headers()).get("host"), params.data_candidate);
    const city = params.city;
    const duration = params.duration;
    const sortBy = params.sort || "recent";

    const [itineraries, popularCities] = await Promise.all(candidate
        ? [previewPublicItineraries(city, duration, sortBy), previewPopularCities()] as const
        : [getPublicItineraries(city, duration, sortBy), getPopularCities()] as const);

    return (
        <AppBackground ambient className="min-h-screen">
            <PageShell>
                <PageHeader
                    eyebrow="Community"
                    eyebrowIcon={Compass}
                    title="Explore Itineraries"
                    lede="Travel plans created by our community. Find inspiration for your next trip."
                />

                <Suspense fallback={<ExploreLoadingSkeleton />}>
                    <ExploreContent
                        itineraries={itineraries}
                        popularCities={popularCities}
                        currentCity={city}
                        currentDuration={duration}
                        currentSort={sortBy}
                    />
                </Suspense>
            </PageShell>
        </AppBackground>
    );
}

function ExploreLoadingSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex gap-4 flex-wrap">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-64 rounded-xl" />
                ))}
            </div>
        </div>
    );
}
