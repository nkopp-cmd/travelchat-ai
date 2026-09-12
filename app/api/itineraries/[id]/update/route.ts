import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import { isDeepStrictEqual } from "node:util";
import { mergeItineraryPlanPayload } from "@/lib/itineraries/plan-contract";
import { isItinerarySnapshot, itinerarySnapshotFields } from "@/lib/itineraries/spot-planning";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await context.params;
        let body;
        try { body = await request.json(); } catch { return Errors.validationError("Invalid JSON body"); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return Errors.validationError("Invalid request body");
        if (!Object.hasOwn(body, "expected")) {
            return NextResponse.json({ error: "A persisted itinerary snapshot is required. Reload before saving." }, { status: 428 });
        }
        if (!isItinerarySnapshot(body.expected)) return Errors.validationError("Invalid expected itinerary snapshot");
        const expected = body.expected;
        const { title, city, days, insights, highlights, estimated_cost } = body;

        // Validate required fields
        if (typeof title !== "string" || !title.trim() || typeof city !== "string" || !city.trim() || !Array.isArray(days)) {
            return Errors.validationError("Missing required fields: title, city, days");
        }

        // Validate days structure
        for (const day of days) {
            if (!day || !Number.isInteger(day.day) || !Array.isArray(day.activities) || day.activities.some((activity: unknown) => !activity || typeof activity !== "object" || Array.isArray(activity))) {
                return Errors.validationError("Invalid days structure");
            }
        }
        if ((highlights !== undefined && (!Array.isArray(highlights) || highlights.some((item: unknown) => typeof item !== "string"))) ||
            (estimated_cost !== undefined && estimated_cost !== null && typeof estimated_cost !== "string") ||
            (insights !== undefined && !Array.isArray(insights))) return Errors.validationError("Invalid itinerary fields");

        const supabase = await createSupabaseServerClient();

        // Check if itinerary exists and user owns it
        const { data: existingItinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !existingItinerary) {
            return Errors.notFound("Itinerary");
        }

        if (existingItinerary.clerk_user_id !== userId) {
            return Errors.forbidden("You don't own this itinerary.");
        }

        // Metadata comes from this owned read. Fence it against the client snapshot
        // before the RPC atomically compares those same five raw values again.
        if (itinerarySnapshotFields.some((field) => !isDeepStrictEqual(existingItinerary[field], expected[field]))) {
            return NextResponse.json({ error: "This itinerary changed elsewhere. Your draft was not saved. Reload after preserving your draft." }, { status: 409 });
        }
        const activitiesPayload = mergeItineraryPlanPayload(
            existingItinerary.activities,
            days,
            insights
        );

        // Send snapshots in the POST body, never in PostgREST URL filters.
        const { data, error } = await supabase.rpc("save_itinerary_snapshot", {
            p_itinerary_id: id,
            p_expected: expected,
            p_replacement: {
                title,
                city,
                activities: activitiesPayload,
                highlights: highlights || [],
                estimated_cost: estimated_cost || null,
            },
        });

        if (error) {
            console.error("Database update error:", error);
            if (error.code === "PGRST202" || error.code === "42883") {
                return NextResponse.json({ error: "Saving is unavailable. The itinerary snapshot database migration is required." }, { status: 503 });
            }
            if (error.code === "42501") return Errors.forbidden("You cannot update this itinerary.");
            return Errors.databaseError();
        }
        if (!Array.isArray(data) || data.length > 1) return Errors.databaseError();
        if (data.length === 0) return NextResponse.json({ error: "This itinerary changed elsewhere. Your draft was not saved. Reload after preserving your draft." }, { status: 409 });

        return NextResponse.json({
            success: true,
            itinerary: data[0],
        });
    } catch (error) {
        return handleApiError(error, "itinerary-update");
    }
}
