import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";
import { isPreviewItineraryDetailCandidate } from "@/lib/app-data/preview-itinerary-detail";
import { duplicatePreviewItinerary } from "@/lib/app-data/preview-itinerary-duplicate";
import { PreviewEditorDeniedError } from "@/lib/app-data/preview-itinerary-editor";
import { matchesPreviewActor } from "@/lib/app-data/preview-actor";

async function previewDuplicate(request: Request, id: string, userId: string) {
    const headers = { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" };
    if (!matchesPreviewActor(request, userId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
    }
    try {
        const result = await duplicatePreviewItinerary(id, userId);
        if (result.state === "missing") return NextResponse.json({ error: "Itinerary not found" }, { status: 404, headers });
        if (result.state === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
        return NextResponse.json(result.itinerary, { headers });
    } catch (error) {
        if (error instanceof PreviewEditorDeniedError) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
        }
        console.error("[PREVIEW_ITINERARY_DUPLICATE] D1 unavailable");
        return NextResponse.json({ error: "Copy unavailable" }, { status: 503, headers });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
        if (isPreviewItineraryDetailCandidate(request)) {
            return previewDuplicate(request, id, userId);
        }
        const supabase = await createSupabaseServerClient();

        // Fetch the original itinerary
        const { data: original, error: fetchError } = await createSupabaseAdmin()
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !original) {
            return Errors.notFound("Itinerary");
        }

        // Check ownership or if it's shared/public
        const canDuplicate = original.clerk_user_id === userId || original.shared || original.is_public;
        if (!canDuplicate) {
            return Errors.forbidden();
        }

        // Create a copy with new ID and timestamps
        const { data: newItinerary, error: insertError } = await supabase
            .from("itineraries")
            .insert({
                clerk_user_id: userId,
                title: original.clerk_user_id === userId
                    ? `${original.title} (Copy)`
                    : original.title,
                subtitle: original.subtitle,
                city: original.city,
                days: original.days,
                activities: original.activities,
                local_score: original.local_score,
                highlights: original.highlights,
                estimated_cost: original.estimated_cost,
                status: "draft",
                is_favorite: false,
                is_public: false,
                shared: false,
            })
            .select()
            .single();

        if (insertError) {
            console.error("Error duplicating itinerary:", insertError);
            return Errors.databaseError();
        }

        return NextResponse.json(newItinerary);
    } catch (error) {
        return handleApiError(error, "itinerary-duplicate");
    }
}
