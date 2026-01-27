import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { ItineraryList } from "@/components/itineraries/itinerary-list";
import { AppBackground } from "@/components/layout/app-background";
import { GradientText } from "@/components/ui/gradient-text";

async function getItineraries(): Promise<{ itineraries: Array<{
    id: string;
    title: string;
    subtitle?: string;
    city: string;
    days: number;
    local_score: number;
    created_at: string;
    status?: "draft" | "completed";
    is_favorite?: boolean;
}>; error: string | null }> {
    try {
        const { userId } = await auth();

        if (!userId) {
            redirect("/sign-in");
        }

        // Use admin client with manual user filtering
        // Note: This bypasses RLS but filters by clerk_user_id explicitly
        // TODO: Configure Clerk JWT template 'supabase' for proper RLS support
        const supabase = createSupabaseAdmin();

        const { data: itineraries, error } = await supabase
            .from("itineraries")
            .select("id, title, subtitle, city, days, local_score, created_at, status, is_favorite")
            .eq("clerk_user_id", userId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[itineraries] Error fetching:", error);
            return { itineraries: [], error: "Failed to load itineraries" };
        }

        // Transform null values to undefined/defaults for component compatibility
        const transformed = (itineraries || []).map(it => ({
            ...it,
            subtitle: it.subtitle ?? undefined,
            local_score: it.local_score ?? 0,
            status: (it.status as "draft" | "completed" | null) ?? undefined,
            is_favorite: it.is_favorite ?? undefined,
        }));
        return { itineraries: transformed, error: null };
    } catch (err) {
        // Handle Clerk auth failures gracefully
        console.error("[itineraries] Auth or fetch error:", err);
        // If auth fails with network error, redirect to sign-in
        redirect("/sign-in");
    }
}

export default async function ItinerariesPage() {
    const { itineraries, error } = await getItineraries();

    return (
        <AppBackground ambient className="min-h-screen">
            <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            <GradientText variant="violet">My Itineraries</GradientText>
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Manage your travel plans and saved trips
                        </p>
                    </div>
                    <Link href="/itineraries/new">
                        <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/20">
                            <Plus className="mr-2 h-4 w-4" />
                            New Itinerary
                        </Button>
                    </Link>
                </div>

                {error && (
                    <div className="rounded-xl border border-amber-200/50 bg-amber-50/80 dark:bg-amber-950/20 backdrop-blur-sm p-4 text-amber-800 dark:border-amber-800/30 dark:text-amber-200">
                        <p>{error}. Please try refreshing the page.</p>
                    </div>
                )}

                <ItineraryList initialItineraries={itineraries} />
            </div>
        </AppBackground>
    );
}
