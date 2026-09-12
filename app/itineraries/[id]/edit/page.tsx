import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase";
import { EditForm } from "@/components/itineraries/edit-form";
import { getPlanningSpot } from "@/lib/spots/planning";
import { isPlanningSpotId, planningCitiesMatch, type PlanningSpot } from "@/lib/itineraries/spot-planning";

export default async function EditItineraryPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ spotId?: string | string[] }>;
}) {
    const { id } = await params;
    const { spotId } = await searchParams || {};
    const { userId } = await auth();

    if (!userId) {
        const localUrl = `/itineraries/${encodeURIComponent(id)}/edit${typeof spotId === "string" ? `?spotId=${encodeURIComponent(spotId)}` : ""}`;
        redirect(`/sign-in?redirect_url=${encodeURIComponent(localUrl)}`);
    }

    // Fetch itinerary from database
    const supabase = createSupabaseAdmin();
    const { data: itinerary, error } = await supabase
        .from("itineraries")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !itinerary) {
        redirect("/itineraries");
    }

    // Check ownership
    if (itinerary.clerk_user_id !== userId) {
        redirect("/itineraries");
    }

    let planningSpot: PlanningSpot | null = null;
    let spotNotice: string | undefined;
    if (spotId !== undefined) {
        try {
            planningSpot = isPlanningSpotId(spotId) ? await getPlanningSpot(spotId) : null;
            if (!planningSpot) spotNotice = "This spot is unavailable for planning. Your itinerary has not changed.";
            else if (!planningCitiesMatch(itinerary.city || "", planningSpot.city)) {
                spotNotice = `This spot is in ${planningSpot.city}. Choose an itinerary for that city. Your itinerary has not changed.`;
                planningSpot = null;
            }
        } catch {
            spotNotice = "We could not load this spot. Try opening it again later. Your itinerary has not changed.";
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
            <div className="container mx-auto px-4 py-8">
                <EditForm key={id} itinerary={itinerary} planningSpot={planningSpot} spotNotice={spotNotice} />
            </div>
        </div>
    );
}
