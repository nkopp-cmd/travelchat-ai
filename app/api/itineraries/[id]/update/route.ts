import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";
import { buildItineraryPlanPayload, normalizeDailyPlansForDisplay } from "@/lib/itineraries/normalize-daily-plans";
import { isPreviewItineraryDetailCandidate } from "@/lib/app-data/preview-itinerary-detail";
import { assertPreviewEditorOwner, isPreviewEditorIntent, PreviewEditorDeniedError, validatePreviewEditorContent } from "@/lib/app-data/preview-itinerary-editor";
import { matchesPreviewActor } from "@/lib/app-data/preview-actor";
import { updatePreviewItinerary } from "@/lib/app-data/preview-itinerary-update";

async function candidateBody(request: NextRequest): Promise<Record<string, unknown>> {
    if (!request.body) throw new RangeError("Invalid itinerary update");
    const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    try {
        for (;;) {
            const {value, done} = await reader.read(); if (done) break;
            size += value.byteLength; if (size > 300000) throw new RangeError("Invalid itinerary update");
            chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const parsed: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
            || Object.keys(parsed).some(key => !["title","city","days","insights","highlights","estimated_cost"].includes(key))) throw new RangeError("Invalid itinerary update");
        return parsed as Record<string, unknown>;
    } catch { throw new RangeError("Invalid itinerary update"); }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const intent = isPreviewEditorIntent(request.nextUrl.hostname, request.nextUrl.searchParams.get("data_candidate"));
    const candidate = isPreviewItineraryDetailCandidate(request);
    const isolated = intent || candidate;
    const reply = (response: NextResponse) => {
        if (isolated) {
            response.headers.set("X-Localley-Data-Source", "d1-preview");
            response.headers.set("Cache-Control", "private, no-store");
        }
        return response;
    };
    try {
        if (isolated && (!intent || !candidate)) return reply(NextResponse.json({error: {code: "feature_disabled", message: "Itinerary unavailable"}}, {status: 503}));
        const { userId } = await auth();
        if (!userId) return reply(Errors.unauthorized());
        if (isolated) {
            if (!matchesPreviewActor(request, userId)) return reply(Errors.forbidden());
            await assertPreviewEditorOwner(userId);
        }
        const { id } = await context.params;
        const body = isolated ? await candidateBody(request) : await request.json();
        const { title, city, days, insights, highlights, estimated_cost } = body;
        if (!title || !city || !days || !Array.isArray(days)) return reply(Errors.validationError(isolated ? "Invalid itinerary update" : "Missing required fields: title, city, days"));
        for (const day of days) {
            if (!day || typeof day.day !== "number" || !Array.isArray(day.activities)) return reply(Errors.validationError(isolated ? "Invalid itinerary update" : "Invalid days structure"));
        }
        if (isolated) {
            validatePreviewEditorContent({title, city, activities: {dailyPlans: days, ...(insights === undefined ? {} : {insights})},
                highlights: highlights || [], estimatedCost: estimated_cost || null}, 30);
            const normalizedPlan = normalizeDailyPlansForDisplay(days, insights);
            const activities = buildItineraryPlanPayload(normalizedPlan.dailyPlans, normalizedPlan.insights);
            const result = await updatePreviewItinerary(id, userId, {
                title, city, activities, highlights: highlights || [], estimatedCost: estimated_cost || null,
            });
            if (result.state === "missing") return reply(Errors.notFound("Itinerary"));
            if (result.state === "forbidden") return reply(Errors.forbidden("You don't own this itinerary."));
            return reply(NextResponse.json({success: true, itinerary: result.itinerary}));
        }
        const supabase = await createSupabaseServerClient();

        // Check if itinerary exists and user owns it
        const { data: existingItinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("clerk_user_id")
            .eq("id", id)
            .single();

        if (fetchError || !existingItinerary) {
            return Errors.notFound("Itinerary");
        }

        if (existingItinerary.clerk_user_id !== userId) {
            return Errors.forbidden("You don't own this itinerary.");
        }

        const normalizedPlan = normalizeDailyPlansForDisplay(days, insights);
        const activitiesPayload = buildItineraryPlanPayload(
            normalizedPlan.dailyPlans,
            normalizedPlan.insights
        );

        // Update itinerary
        const { data, error } = await supabase
            .from("itineraries")
            .update({
                title,
                city,
                activities: activitiesPayload,
                highlights: highlights || [],
                estimated_cost: estimated_cost || null,
            })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Database update error:", error);
            return Errors.databaseError();
        }

        return NextResponse.json({
            success: true,
            itinerary: data,
        });
    } catch (error) {
        if (isolated) {
            if (error instanceof PreviewEditorDeniedError) return reply(Errors.forbidden());
            if (error instanceof RangeError) return reply(Errors.validationError("Invalid itinerary update"));
            return reply(Errors.databaseError());
        }
        return handleApiError(error, "itinerary-update");
    }
}
