import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
        const supabase = await createSupabaseServerClient();

        // Verify ownership before deleting
        const { data: itinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("clerk_user_id")
            .eq("id", id)
            .single();

        if (fetchError || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        if (itinerary.clerk_user_id !== userId) {
            return Errors.forbidden();
        }

        // Delete the itinerary
        const { error: deleteError } = await supabase
            .from("itineraries")
            .delete()
            .eq("id", id);

        if (deleteError) {
            console.error("Error deleting itinerary:", deleteError);
            return Errors.databaseError();
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, "itinerary-delete");
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
        const supabase = await createSupabaseServerClient();

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        // Check ownership or if itinerary is shared
        if (itinerary.clerk_user_id !== userId && !itinerary.is_public) {
            return Errors.forbidden();
        }

        return NextResponse.json(itinerary);
    } catch (error) {
        return handleApiError(error, "itinerary-get");
    }
}
