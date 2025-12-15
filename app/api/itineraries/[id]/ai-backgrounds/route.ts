import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * PATCH /api/itineraries/[id]/ai-backgrounds
 * Update AI-generated backgrounds for an itinerary's story slides
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { cover, summary } = body;

        // Validate that at least one background is provided
        if (!cover && !summary) {
            return NextResponse.json(
                { error: "At least one background (cover or summary) is required" },
                { status: 400 }
            );
        }

        const supabase = createSupabaseAdmin();

        // First verify the itinerary belongs to the user
        const { data: itinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("clerk_user_id")
            .eq("id", id)
            .single();

        if (fetchError || !itinerary) {
            return NextResponse.json(
                { error: "Itinerary not found" },
                { status: 404 }
            );
        }

        if (itinerary.clerk_user_id !== userId) {
            return NextResponse.json(
                { error: "You don't have permission to modify this itinerary" },
                { status: 403 }
            );
        }

        // Build the ai_backgrounds object
        const aiBackgrounds: { cover?: string; summary?: string } = {};
        if (cover) aiBackgrounds.cover = cover;
        if (summary) aiBackgrounds.summary = summary;

        // Update the itinerary with AI backgrounds
        const { data, error: updateError } = await supabase
            .from("itineraries")
            .update({ ai_backgrounds: aiBackgrounds })
            .eq("id", id)
            .select()
            .single();

        if (updateError) {
            console.error("[AI_BACKGROUNDS_UPDATE_ERROR]", updateError);
            return NextResponse.json(
                { error: "Failed to update AI backgrounds" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            itinerary: data,
        });
    } catch (error) {
        console.error("[AI_BACKGROUNDS_ERROR]", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/itineraries/[id]/ai-backgrounds
 * Retrieve AI-generated backgrounds for an itinerary
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createSupabaseAdmin();

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("ai_backgrounds")
            .eq("id", id)
            .single();

        if (error || !itinerary) {
            return NextResponse.json(
                { error: "Itinerary not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            backgrounds: itinerary.ai_backgrounds || {},
        });
    } catch (error) {
        console.error("[AI_BACKGROUNDS_GET_ERROR]", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
