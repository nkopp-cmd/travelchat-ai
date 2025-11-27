import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase";
import { EditForm } from "@/components/itineraries/edit-form";

export default async function EditItineraryPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const { id } = await params;

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

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
            <div className="container mx-auto px-4 py-8">
                <EditForm itinerary={itinerary} />
            </div>
        </div>
    );
}
