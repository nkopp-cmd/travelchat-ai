import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * Validate that a string is a valid base64-encoded data URL for an image
 */
function validateBase64Image(data: string): boolean {
    // Check it's a data URL with image mime type
    if (!data.startsWith('data:image/')) return false;

    // Check it has base64 encoding
    if (!data.includes(';base64,')) return false;

    // Extract and validate base64 content
    const base64Part = data.split(',')[1];
    if (!base64Part) return false;

    // Check length is reasonable (not empty, not too large)
    // Min: 100 chars (~75 bytes), Max: 10MB (~7.5MB base64)
    if (base64Part.length < 100 || base64Part.length > 10_000_000) {
        return false;
    }

    // Validate base64 characters (optional but recommended)
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64Part)) {
        return false;
    }

    return true;
}

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

        // Validate cover image format if provided
        if (cover && !validateBase64Image(cover)) {
            console.error("[AI_BACKGROUNDS] Invalid cover image format");
            return NextResponse.json(
                { error: "Invalid cover image format. Must be a valid base64-encoded data URL." },
                { status: 400 }
            );
        }

        // Validate summary image format if provided
        if (summary && !validateBase64Image(summary)) {
            console.error("[AI_BACKGROUNDS] Invalid summary image format");
            return NextResponse.json(
                { error: "Invalid summary image format. Must be a valid base64-encoded data URL." },
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

        // Fetch existing backgrounds to merge with new ones
        const { data: existing } = await supabase
            .from("itineraries")
            .select("ai_backgrounds")
            .eq("id", id)
            .single();

        // Merge new backgrounds with existing ones (with safer type handling)
        interface AiBackgrounds {
            cover?: string;
            summary?: string;
        }

        const existingBackgrounds: AiBackgrounds =
            (existing?.ai_backgrounds && typeof existing.ai_backgrounds === 'object')
                ? existing.ai_backgrounds as AiBackgrounds
                : {};

        const aiBackgrounds: AiBackgrounds = {
            ...existingBackgrounds,
        };
        if (cover) aiBackgrounds.cover = cover;
        if (summary) aiBackgrounds.summary = summary;

        console.log("[AI_BACKGROUNDS] Updating with:", {
            hasCover: !!aiBackgrounds.cover,
            hasSummary: !!aiBackgrounds.summary,
            coverLength: aiBackgrounds.cover?.length,
            summaryLength: aiBackgrounds.summary?.length,
        });

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
