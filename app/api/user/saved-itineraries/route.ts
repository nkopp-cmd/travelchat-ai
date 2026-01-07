import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";

// GET - Get user's saved/liked itineraries
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const supabase = await createSupabaseServerClient();

        // Get saved itinerary IDs
        const { data: saved, error: savedError } = await supabase
            .from("saved_itineraries")
            .select("itinerary_id, created_at")
            .eq("clerk_user_id", userId)
            .order("created_at", { ascending: false });

        if (savedError) {
            console.error("Error fetching saved itineraries:", savedError);
            return Errors.databaseError();
        }

        if (!saved || saved.length === 0) {
            return NextResponse.json({ itineraries: [] });
        }

        // Get itinerary details
        const itineraryIds = saved.map((s) => s.itinerary_id);
        const { data: itineraries, error: itinerariesError } = await supabase
            .from("itineraries")
            .select(`
                id,
                title,
                city,
                days,
                local_score,
                share_code,
                view_count,
                like_count,
                created_at,
                clerk_user_id
            `)
            .in("id", itineraryIds)
            .eq("shared", true);

        if (itinerariesError) {
            console.error("Error fetching itinerary details:", itinerariesError);
            return Errors.databaseError();
        }

        // Get creator info
        const creatorIds = [...new Set((itineraries || []).map((i) => i.clerk_user_id))];
        const { data: users } = await supabase
            .from("users")
            .select("clerk_id, name, avatar_url")
            .in("clerk_id", creatorIds);

        const userMap = new Map(
            (users || []).map((u) => [u.clerk_id, { name: u.name, avatarUrl: u.avatar_url }])
        );

        // Map and return
        const result = (itineraries || []).map((itinerary) => {
            const creator = userMap.get(itinerary.clerk_user_id);
            const savedItem = saved.find((s) => s.itinerary_id === itinerary.id);
            return {
                id: itinerary.id,
                title: itinerary.title,
                city: itinerary.city,
                days: itinerary.days,
                localScore: itinerary.local_score || 0,
                shareCode: itinerary.share_code,
                viewCount: itinerary.view_count || 0,
                likeCount: itinerary.like_count || 0,
                createdAt: itinerary.created_at,
                savedAt: savedItem?.created_at,
                creatorName: creator?.name || null,
                creatorAvatar: creator?.avatarUrl || null,
            };
        });

        // Sort by saved date
        result.sort((a, b) => {
            const dateA = a.savedAt ? new Date(a.savedAt).getTime() : 0;
            const dateB = b.savedAt ? new Date(b.savedAt).getTime() : 0;
            return dateB - dateA;
        });

        return NextResponse.json({ itineraries: result });
    } catch (error) {
        return handleApiError(error, "saved-itineraries");
    }
}
