import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";

/**
 * Validate that a string is a valid image source (base64 data URL or external URL)
 */
function validateImageSource(data: string): boolean {
    // Accept external image URLs (Unsplash, Pexels, TripAdvisor, etc.)
    if (data.startsWith('https://images.unsplash.com/') ||
        data.startsWith('https://images.pexels.com/') ||
        data.startsWith('https://media-cdn.tripadvisor.com/') ||
        data.startsWith('https://')) {
        // Basic URL validation - check it looks like an image URL
        const url = data.toLowerCase();
        const hasImageExtension = url.includes('.jpg') || url.includes('.jpeg') ||
                                  url.includes('.png') || url.includes('.webp') ||
                                  url.includes('fit=crop') || url.includes('/photo');
        return hasImageExtension || url.includes('unsplash') || url.includes('pexels') || url.includes('supabase');
    }

    // Reject base64 data URLs — all images should be HTTPS URLs now
    // (from Supabase storage, Unsplash, Pexels, TripAdvisor, or placeholder)
    // Base64 was previously accepted but caused 413 Payload Too Large errors
    return false;
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
            return Errors.unauthorized();
        }

        const { id } = await params;
        const body = await req.json();

        // Extract known fields and any day backgrounds (day1, day2, etc.)
        const { cover, summary, ...rest } = body;

        // Collect day backgrounds from rest
        const dayBackgrounds: Record<string, string> = {};
        for (const key of Object.keys(rest)) {
            if (key.match(/^day\d+$/) && typeof rest[key] === 'string') {
                dayBackgrounds[key] = rest[key];
            }
        }

        // Validate that at least one background is provided
        const hasAnyBackground = cover || summary || Object.keys(dayBackgrounds).length > 0;
        if (!hasAnyBackground) {
            return Errors.validationError("At least one background is required");
        }

        // Validate cover image format if provided
        if (cover && !validateImageSource(cover)) {
            console.error("[AI_BACKGROUNDS] Invalid cover image format:", cover.substring(0, 100));
            return Errors.validationError("Invalid cover image format. Must be a valid image URL or base64-encoded data URL.");
        }

        // Validate summary image format if provided
        if (summary && !validateImageSource(summary)) {
            console.error("[AI_BACKGROUNDS] Invalid summary image format:", summary.substring(0, 100));
            return Errors.validationError("Invalid summary image format. Must be a valid image URL or base64-encoded data URL.");
        }

        // Validate day background formats
        for (const [key, value] of Object.entries(dayBackgrounds)) {
            if (!validateImageSource(value)) {
                console.error(`[AI_BACKGROUNDS] Invalid ${key} image format:`, value.substring(0, 100));
                return Errors.validationError(`Invalid ${key} image format. Must be a valid image URL or base64-encoded data URL.`);
            }
        }

        const supabase = await createSupabaseServerClient();

        // First verify the itinerary belongs to the user
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

        // Fetch existing backgrounds to merge with new ones
        const { data: existing } = await supabase
            .from("itineraries")
            .select("ai_backgrounds")
            .eq("id", id)
            .single();

        // Merge new backgrounds with existing ones (with safer type handling)
        // Allow cover, summary, and day1, day2, etc.
        type AiBackgrounds = Record<string, string>;

        const existingBackgrounds: AiBackgrounds =
            (existing?.ai_backgrounds && typeof existing.ai_backgrounds === 'object')
                ? existing.ai_backgrounds as AiBackgrounds
                : {};

        const aiBackgrounds: AiBackgrounds = {
            ...existingBackgrounds,
            ...dayBackgrounds, // Include day1, day2, etc.
        };
        if (cover) aiBackgrounds.cover = cover;
        if (summary) aiBackgrounds.summary = summary;

        console.log("[AI_BACKGROUNDS] Updating with:", {
            hasCover: !!aiBackgrounds.cover,
            hasSummary: !!aiBackgrounds.summary,
            dayCount: Object.keys(dayBackgrounds).length,
            allKeys: Object.keys(aiBackgrounds),
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
            return Errors.databaseError();
        }

        return NextResponse.json({
            success: true,
            itinerary: data,
        });
    } catch (error) {
        console.error("[AI_BACKGROUNDS_ERROR]", error);
        return handleApiError(error, "ai-backgrounds-update");
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
        const supabase = await createSupabaseServerClient();

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("ai_backgrounds")
            .eq("id", id)
            .single();

        if (error || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        return NextResponse.json({
            success: true,
            backgrounds: itinerary.ai_backgrounds || {},
        });
    } catch (error) {
        console.error("[AI_BACKGROUNDS_GET_ERROR]", error);
        return handleApiError(error, "ai-backgrounds-get");
    }
}
