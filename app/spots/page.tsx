import { Suspense } from "react";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Spot, MultiLanguageField } from "@/types";
import { SpotsExplorer } from "@/components/spots/spots-explorer";
import { SpotCardSkeleton } from "@/components/ui/skeleton";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Discover Hidden Gems",
    description: "Find local favorites across Seoul, Tokyo, Bangkok, and Singapore. Curated spots rated by locals.",
};

// Supabase spot raw type
interface RawSpot {
    id: string;
    name: MultiLanguageField;
    description: MultiLanguageField;
    address: MultiLanguageField;
    category: string | null;
    subcategories: string[] | null;
    location: {
        coordinates: [number, number];
    } | null;
    localley_score: number | null;
    local_percentage: number | null;
    best_time: string | null;
    photos: string[] | null;
    image_url: string | null;
    tips: string[] | null;
    verified: boolean | null;
    trending_score: number;
}

/**
 * Parse multi-language field to string
 */
function getLocalizedText(field: MultiLanguageField): string {
    if (typeof field === "object" && field !== null) {
        return field.en || Object.values(field)[0] || "";
    }
    return field || "";
}

/**
 * Transform raw Supabase spot to application Spot type
 */
function transformSpot(spot: RawSpot): Spot {
    const lat = spot.location?.coordinates?.[1] || 0;
    const lng = spot.location?.coordinates?.[0] || 0;

    return {
        id: spot.id,
        name: getLocalizedText(spot.name),
        description: getLocalizedText(spot.description),
        category: spot.category || "Uncategorized",
        subcategories: spot.subcategories || [],
        location: {
            lat,
            lng,
            address: getLocalizedText(spot.address)
        },
        localleyScore: spot.localley_score || 3,
        localPercentage: spot.local_percentage || 50,
        bestTime: spot.best_time || "Anytime",
        photos: spot.photos || [spot.image_url || "/placeholder-spot.jpg"],
        tips: spot.tips || [],
        verified: spot.verified || false,
        trending: spot.trending_score > 0.7 || false
    };
}

/**
 * Fetch spots from database (server-side)
 */
async function getSpots(): Promise<{ spots: Spot[]; count: number }> {
    const supabase = createSupabaseAdmin();

    const { data: spotsData, error, count } = await supabase
        .from("spots")
        .select("*", { count: "exact" })
        .order("localley_score", { ascending: false })
        .limit(50);

    if (error || !spotsData) {
        console.error("[spots/page] Error fetching spots:", error);
        return { spots: [], count: 0 };
    }

    const spots = spotsData.map((spot: RawSpot) => transformSpot(spot));
    return { spots, count: count || spots.length };
}

/**
 * Loading skeleton for spots
 */
function SpotsLoading() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {[...Array(6)].map((_, i) => (
                <SpotCardSkeleton key={i} />
            ))}
        </div>
    );
}

/**
 * Server component for spots page content
 */
async function SpotsContent() {
    const { spots, count } = await getSpots();

    return (
        <SpotsExplorer
            initialSpots={spots}
            totalCount={count}
        />
    );
}

/**
 * Spots Page - Server Component
 *
 * Fetches initial spots data on the server for faster initial load and SEO.
 * Filtering and sorting is handled client-side for interactivity.
 */
export default function SpotsPage() {
    return (
        <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                    Discover Hidden Gems
                </h1>
                <p className="text-muted-foreground">
                    Local favorites across Seoul, Tokyo, Bangkok, and Singapore
                </p>
            </div>

            <Suspense fallback={<SpotsLoading />}>
                <SpotsContent />
            </Suspense>
        </div>
    );
}
