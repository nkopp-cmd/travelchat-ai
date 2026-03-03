import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";

export const maxDuration = 30;

/**
 * POST /api/itineraries/[id]/story/save
 * Render all story slides and persist PNGs to Supabase Storage.
 * Returns stored URLs so the client can link to the public stories page.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const { id } = await params;
        const { totalDays, paid } = await req.json();

        if (!totalDays || typeof totalDays !== "number" || totalDays < 1) {
            return Errors.validationError("totalDays must be a positive number");
        }

        const supabase = createSupabaseAdmin();

        // Verify ownership
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

        // Build the base URL for internal story route calls
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : `http://localhost:${process.env.PORT || 3000}`;

        const paidParam = paid ? "&paid=true" : "";

        // Define all slides to render
        const slideSpecs = [
            { key: "cover", params: `slide=cover${paidParam}` },
            ...Array.from({ length: totalDays }, (_, i) => ({
                key: `day${i + 1}`,
                params: `slide=day&day=${i + 1}${paidParam}`,
            })),
            { key: "summary", params: `slide=summary${paidParam}` },
        ];

        console.log("[STORY_SAVE] Rendering and saving", slideSpecs.length, "slides for:", id);

        // Render all slides in parallel
        const results = await Promise.allSettled(
            slideSpecs.map(async (spec) => {
                const url = `${baseUrl}/api/itineraries/${id}/story?${spec.params}`;
                const res = await fetch(url, {
                    signal: AbortSignal.timeout(20000),
                });
                if (!res.ok) {
                    throw new Error(`Render failed HTTP ${res.status} for ${spec.key}`);
                }

                const contentType = res.headers.get("content-type") || "";
                if (!contentType.includes("image/")) {
                    throw new Error(`Expected image, got ${contentType} for ${spec.key}`);
                }

                const buffer = Buffer.from(await res.arrayBuffer());
                console.log(`[STORY_SAVE] Rendered ${spec.key}: ${buffer.byteLength} bytes`);

                // Upload to Supabase Storage
                const storagePath = `story-slides/${id}/${spec.key}.png`;
                const { error: uploadError } = await supabase.storage
                    .from("generated-images")
                    .upload(storagePath, buffer, {
                        contentType: "image/png",
                        upsert: true,
                    });

                if (uploadError) {
                    throw new Error(`Upload failed for ${spec.key}: ${uploadError.message}`);
                }

                const { data: urlData } = supabase.storage
                    .from("generated-images")
                    .getPublicUrl(storagePath);

                return { key: spec.key, url: urlData.publicUrl };
            })
        );

        // Collect successes and failures
        const slides: Record<string, string> = {};
        const failed: string[] = [];

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === "fulfilled") {
                slides[result.value.key] = result.value.url;
            } else {
                failed.push(slideSpecs[i].key);
                console.error(`[STORY_SAVE] Failed ${slideSpecs[i].key}:`, result.reason);
            }
        }

        // Save to database (even partial results)
        if (Object.keys(slides).length > 0) {
            const { error: updateError } = await supabase
                .from("itineraries")
                .update({ story_slides: slides })
                .eq("id", id);

            if (updateError) {
                console.error("[STORY_SAVE] DB update failed:", updateError);
                return Errors.databaseError();
            }
        }

        console.log("[STORY_SAVE] Complete:", {
            saved: Object.keys(slides).length,
            failed: failed.length,
            keys: Object.keys(slides),
        });

        return NextResponse.json({
            success: true,
            slides,
            failed: failed.length > 0 ? failed : undefined,
        });
    } catch (error) {
        console.error("[STORY_SAVE] Error:", error);
        return handleApiError(error, "story-save");
    }
}
