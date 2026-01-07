import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { ItineraryList } from "@/components/itineraries/itinerary-list";

async function getItineraries() {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    // Use RLS-respecting client - filters by user automatically via RLS policy
    const supabase = await createSupabaseServerClient();

    const { data: itineraries, error } = await supabase
        .from("itineraries")
        .select("id, title, subtitle, city, days, local_score, created_at, status, is_favorite")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching itineraries:", error);
        return [];
    }

    return itineraries || [];
}

export default async function ItinerariesPage() {
    const itineraries = await getItineraries();

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">My Itineraries</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your travel plans and saved trips
                    </p>
                </div>
                <Link href="/itineraries/new">
                    <Button className="bg-violet-600 hover:bg-violet-700">
                        <Plus className="mr-2 h-4 w-4" />
                        New Itinerary
                    </Button>
                </Link>
            </div>

            <ItineraryList initialItineraries={itineraries} />
        </div>
    );
}
