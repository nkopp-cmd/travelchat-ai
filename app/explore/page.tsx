import { Suspense } from "react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { ExploreContent } from "./explore-content";
import { Skeleton } from "@/components/ui/skeleton";

import type { Metadata } from "next";

export const metadata: Metadata = {
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
            users!itineraries_clerk_user_id_fkey (
                name,
                avatar_url
            )
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

    return (data || []).map((item) => {
        // Handle both array and single object returns from Supabase
        const usersData = item.users;
        const user = Array.isArray(usersData)
            ? usersData[0] as { name: string | null; avatar_url: string | null } | undefined
            : usersData as { name: string | null; avatar_url: string | null } | null;
        return {
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
            creatorName: user?.name || null,
            creatorAvatar: user?.avatar_url || null,
        };
    });
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
    searchParams: Promise<{ city?: string; duration?: string; sort?: string }>;
}) {
    const params = await searchParams;
    const city = params.city;
    const duration = params.duration;
    const sortBy = params.sort || "recent";

    const [itineraries, popularCities] = await Promise.all([
        getPublicItineraries(city, duration, sortBy),
        getPopularCities(),
    ]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50/50 via-white to-indigo-50/50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                {/* Header */}
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                        Explore Itineraries
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Discover travel plans created by our community. Find inspiration for your next adventure
                        and explore hidden gems around the world.
                    </p>
                </div>

                <Suspense fallback={<ExploreLoadingSkeleton />}>
                    <ExploreContent
                        itineraries={itineraries}
                        popularCities={popularCities}
                        currentCity={city}
                        currentDuration={duration}
                        currentSort={sortBy}
                    />
                </Suspense>
            </div>
        </div>
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
