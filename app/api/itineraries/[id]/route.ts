import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import { trackEngagement } from "@/lib/engagement-tracking";
import { isPreviewItineraryDetailCandidate, previewItineraryDetail } from "@/lib/app-data/preview-itinerary-detail";
import { isPreviewEditorIntent, PreviewEditorDeniedError } from "@/lib/app-data/preview-itinerary-editor";
import { deletePreviewItinerary } from "@/lib/app-data/preview-itinerary-delete";
import { storySlideKeys, storySlidesBucket } from "@/lib/story-slides-r2";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const intent = isPreviewEditorIntent(request.nextUrl.hostname, request.nextUrl.searchParams.get("data_candidate"));
    const candidate = isPreviewItineraryDetailCandidate(request);
    const reply = (response: NextResponse) => {
        if (intent || candidate) {
            response.headers.set("X-Localley-Data-Source", "d1-preview");
            response.headers.set("Cache-Control", "private, no-store");
        }
        return response;
    };
    try {
        if ((intent || candidate) && (!intent || !candidate)) {
            return reply(NextResponse.json({ error: "Itinerary unavailable" }, { status: 503 }));
        }
        const { userId } = await auth();
        if (!userId) return reply(Errors.unauthorized());
        const { id } = await params;
        if (candidate) {
            if (request.headers.get("X-Localley-Preview-Actor") !== userId) return reply(Errors.forbidden());
            try {
                const result = await deletePreviewItinerary(id, userId);
                if (result === "missing") return reply(Errors.notFound("Itinerary"));
                if (result === "forbidden") return reply(Errors.forbidden());
                return reply(NextResponse.json({ success: true }));
            } catch (error) {
                return reply(error instanceof PreviewEditorDeniedError ? Errors.forbidden() : Errors.databaseError());
            }
        }
        const supabase = await createSupabaseServerClient();

        // Verify ownership before deleting
        const { data: itinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("clerk_user_id, story_slides")
            .eq("id", id)
            .single();

        if (fetchError || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        if (itinerary.clerk_user_id !== userId) {
            return Errors.forbidden();
        }

        // Story slides in R2 belong to the itinerary: delete them before the row.
        const slideKeys = storySlideKeys(id, itinerary.story_slides);
        const slideBucket = slideKeys.length ? storySlidesBucket() : null;
        for (const key of slideKeys) await slideBucket?.delete(key);

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
        return (intent || candidate) ? reply(Errors.databaseError()) : handleApiError(error, "itinerary-delete");
    }
}

export async function GET(
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
            const withSource = (response: NextResponse) => {
                response.headers.set("X-Localley-Data-Source", "d1-preview");
                response.headers.set("Cache-Control", "no-store");
                return response;
            };
            try {
                const result = await previewItineraryDetail(id, userId);
                if (result.state === "missing") return withSource(Errors.notFound("Itinerary"));
                if (result.state === "forbidden") return withSource(Errors.forbidden());
                return withSource(NextResponse.json(result.itinerary));
            } catch {
                return withSource(Errors.databaseError());
            }
        }
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

        if (itinerary.clerk_user_id) {
            void trackEngagement(userId, "itinerary_view", id, itinerary.clerk_user_id);
        }

        return NextResponse.json(itinerary);
    } catch (error) {
        return handleApiError(error, "itinerary-get");
    }
}
