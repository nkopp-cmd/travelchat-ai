import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getUserTier } from "@/lib/usage-tracking";
import { hasFeature } from "@/lib/subscription";
import { Errors, handleApiError } from "@/lib/api-errors";

// Uploading multiple slide PNGs can take time
export const maxDuration = 30;

/**
 * POST /api/itineraries/[id]/story/persist
 * Persist rendered story slide PNGs to Supabase Storage.
 * Client sends slides as FormData (cover, day1, day2, ..., summary).
 * Returns public URLs and expiry based on user tier.
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

        // Verify itinerary ownership
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

        // Get user tier for retention period
        const tier = await getUserTier(userId);
        const retentionDays = hasFeature(tier, "storyRetentionDays");

        const formData = await req.formData();
        const slides: Record<string, string> = {};
        const errors: string[] = [];

        // Process each slide from FormData
        for (const [key, value] of formData.entries()) {
            // Accept: cover, day1, day2, ..., summary
            if (!/^(cover|day\d+|summary)$/.test(key)) {
                continue;
            }

            if (!(value instanceof Blob)) {
                errors.push(`${key}: not a file`);
                continue;
            }

            // Validate file size (max 2MB per slide)
            if (value.size > 2 * 1024 * 1024) {
                errors.push(`${key}: exceeds 2MB limit`);
                continue;
            }

            try {
                const buffer = Buffer.from(await value.arrayBuffer());
                const storageKey = `story-slides/${id}/${key}.png`;

                const { error: uploadError } = await supabase.storage
                    .from("generated-images")
                    .upload(storageKey, buffer, {
                        contentType: "image/png",
                        upsert: true,
                    });

                if (uploadError) {
                    console.error(`[STORY_PERSIST] Upload failed for ${key}:`, uploadError.message);
                    errors.push(`${key}: upload failed`);
                    continue;
                }

                const { data: urlData } = supabase.storage
                    .from("generated-images")
                    .getPublicUrl(storageKey);

                if (urlData?.publicUrl) {
                    slides[key] = urlData.publicUrl;
                }
            } catch (err) {
                console.error(`[STORY_PERSIST] Error processing ${key}:`, err);
                errors.push(`${key}: processing error`);
            }
        }

        if (Object.keys(slides).length === 0) {
            return Errors.validationError("No valid slides were uploaded");
        }

        // Calculate expiry
        const now = new Date();
        const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

        const storySlides = {
            generated_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            tier,
            slides,
        };

        // Update itinerary with persisted slide metadata
        const { error: updateError } = await supabase
            .from("itineraries")
            .update({ story_slides: storySlides })
            .eq("id", id);

        if (updateError) {
            console.error("[STORY_PERSIST] DB update failed:", updateError);
            return Errors.databaseError();
        }

        console.log("[STORY_PERSIST] Saved", Object.keys(slides).length, "slides for", id, {
            tier,
            retentionDays,
            expiresAt: expiresAt.toISOString(),
        });

        return NextResponse.json({
            success: true,
            slides,
            expiresAt: expiresAt.toISOString(),
            retentionDays,
            tier,
            ...(errors.length > 0 && { warnings: errors }),
        });
    } catch (error) {
        console.error("[STORY_PERSIST] Error:", error);
        return handleApiError(error, "story-persist");
    }
}

/**
 * GET /api/itineraries/[id]/story/persist
 * Check if persisted story slides exist and are still valid.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createSupabaseAdmin();

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("story_slides, shared")
            .eq("id", id)
            .single();

        if (error || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        const storySlides = itinerary.story_slides as {
            generated_at: string;
            expires_at: string;
            tier: string;
            slides: Record<string, string>;
        } | null;

        if (!storySlides?.slides) {
            return NextResponse.json({ success: true, available: false });
        }

        // Check expiry
        const expired = new Date(storySlides.expires_at) < new Date();

        return NextResponse.json({
            success: true,
            available: !expired,
            expired,
            slides: expired ? null : storySlides.slides,
            generatedAt: storySlides.generated_at,
            expiresAt: storySlides.expires_at,
            tier: storySlides.tier,
        });
    } catch (error) {
        console.error("[STORY_PERSIST_GET] Error:", error);
        return handleApiError(error, "story-persist-get");
    }
}
