import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { ItineraryList } from "@/components/itineraries/itinerary-list";
import { AppBackground } from "@/components/layout/app-background";
import { GradientText } from "@/components/ui/gradient-text";
import { getPlanningSpot } from "@/lib/spots/planning";
import { planningCitiesMatch, type PlanningSpot } from "@/lib/itineraries/spot-planning";

async function getItineraries(returnTo: string): Promise<{ itineraries: Array<{
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
    const { userId } = await auth();
    if (!userId) {
        redirect(`/sign-in?${new URLSearchParams({ redirect_url: returnTo })}`);
    }
    try {
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
        console.error("[itineraries] Fetch error:", err);
        return { itineraries: [], error: "Failed to load itineraries" };
    }
}

export default async function ItinerariesPage({ searchParams }: {
    searchParams: Promise<{ spotId?: string | string[] }>;
}) {
    const query = await searchParams;
    const choosingTrip = query.spotId !== undefined;
    const spotId = typeof query.spotId === "string" ? query.spotId : "";
    const returnTo = spotId ? `/itineraries?${new URLSearchParams({ spotId })}` : "/itineraries";
    const { itineraries, error } = await getItineraries(returnTo);
    let spot: PlanningSpot | null = null;
    let spotError: string | null = null;
    if (choosingTrip) {
        try {
            spot = await getPlanningSpot(spotId);
            if (!spot) spotError = "This place is unavailable for planning. Choose another place from discovery.";
        } catch {
            spotError = "We could not load this place. Refresh the page to try again.";
        }
    }
    const compatibleTrips = spot ? itineraries.filter((trip) => planningCitiesMatch(trip.city, spot.city)) : [];

    return (
        <AppBackground ambient fitParent>
            <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            <GradientText variant="violet">{choosingTrip ? "Choose an itinerary" : "My Itineraries"}</GradientText>
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            {spot ? `Plan a visit to ${spot.name} in ${spot.city}.` : "Manage your travel plans and saved trips"}
                        </p>
                    </div>
                    <Link href={spot ? `/itineraries/new?${new URLSearchParams({ city: spot.city, spotId: spot.id })}` : "/itineraries/new"}>
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

                {choosingTrip ? (
                    <section aria-label="Add a discovered place" className="space-y-4">
                        <p className="text-muted-foreground">
                            Choose a trip in the same city, then confirm its day and position in the editor.
                            Nothing is added until you confirm. Bookmarks stay separate.
                        </p>
                        {spotError && <p role="alert" className="rounded-lg border border-border bg-background p-4">{spotError}</p>}
                        {spot && !error && compatibleTrips.length === 0 && (
                            <p className="rounded-lg border border-border bg-background p-4">
                                You do not have an itinerary in {spot.city} yet. Create a trip first, then return to add this place.
                            </p>
                        )}
                        {spot && !error && compatibleTrips.length > 0 && (
                            <ul className="divide-y divide-border rounded-lg border border-border bg-background">
                                {compatibleTrips.map((trip) => (
                                    <li key={trip.id}>
                                        <Link
                                            href={`/itineraries/${trip.id}/edit?${new URLSearchParams({ spotId: spot.id })}`}
                                            className="flex min-h-11 flex-col gap-2 rounded-lg p-4 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <span className="min-w-0 break-words font-semibold">{trip.title}</span>
                                            <span className="shrink-0 text-sm text-muted-foreground">{trip.city} / {trip.days} {trip.days === 1 ? "day" : "days"}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex flex-wrap gap-3">
                            <Button asChild variant="outline"><Link href={spot ? `/spots/${spot.id}` : "/spots"}>Back to discovery</Link></Button>
                            <Button asChild variant="outline"><Link href="/itineraries">View all itineraries</Link></Button>
                        </div>
                    </section>
                ) : <ItineraryList initialItineraries={itineraries} />}
            </div>
        </AppBackground>
    );
}
