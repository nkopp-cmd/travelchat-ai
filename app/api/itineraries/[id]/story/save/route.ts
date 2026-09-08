import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Errors, handleApiError } from "@/lib/api-errors";
import { GET as renderStory } from "../route";

export const maxDuration = 60;

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
        const supabase = createSupabaseAdmin();

        // Verify ownership
        const { data: itinerary, error: fetchError } = await supabase
            .from("itineraries")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        if (itinerary.clerk_user_id !== userId) {
            return Errors.forbidden();
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return Errors.validationError("Invalid JSON body");
        }
        const { totalDays, paid } = body ?? {};
        if (typeof totalDays !== "number" || !Number.isInteger(totalDays) || totalDays < 1 || totalDays > 30) {
            return Errors.validationError("totalDays must be an integer between 1 and 30");
        }

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
                const url = new URL(req.url);
                url.pathname = `/api/itineraries/${encodeURIComponent(id)}/story`;
                url.search = spec.params;
                // Direct invocation retains the outer Clerk request context without self-HTTP or forwarded credentials.
                const res = await renderStory(new NextRequest(url), { params: Promise.resolve({ id }) });
                if (!res.ok) {
                    throw new Error(`Render failed HTTP ${res.status} for ${spec.key}`);
                }

                const contentType = res.headers.get("content-type") || "";
                if (!contentType.includes("image/")) {
                    throw new Error(`Expected image, got ${contentType} for ${spec.key}`);
                }

                const buffer = Buffer.from(await res.arrayBuffer());
                if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
                    throw new Error(`Expected PNG bytes for ${spec.key}`);
                }
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
                .eq("id", id)
                .eq("clerk_user_id", userId);

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
