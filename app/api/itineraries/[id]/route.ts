import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const supabase = createSupabaseAdmin();

        // Verify ownership before deleting
        const { data: itinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("clerk_user_id")
            .eq("id", id)
            .single();

        if (fetchError || !itinerary) {
            return NextResponse.json({ error: "Itinerary not found" }, { status: 404 });
        }

        if (itinerary.clerk_user_id !== userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Delete the itinerary
        const { error: deleteError } = await supabase
            .from("itineraries")
            .delete()
            .eq("id", id);

        if (deleteError) {
            console.error("Error deleting itinerary:", deleteError);
            return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const supabase = createSupabaseAdmin();

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !itinerary) {
            return NextResponse.json({ error: "Itinerary not found" }, { status: 404 });
        }

        // Check ownership or if itinerary is shared
        if (itinerary.clerk_user_id !== userId && !itinerary.is_public) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        return NextResponse.json(itinerary);
    } catch (error) {
        console.error("Get error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
