import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@/lib/auth/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getUserTier } from "@/lib/usage-tracking";
import { hasFeature } from "@/lib/subscription";
import { Errors, handleApiError } from "@/lib/api-errors";
import { previewStorySlides } from "@/lib/app-data/preview-story-slides";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { previewStoryOwner, savePreviewStoryMedia } from "@/lib/app-data/preview-story-media";
import { previewStoryTier } from "@/lib/app-data/preview-story-tier";
import { readPreviewStoryForm, previewStorySlideBytes } from "@/lib/app-data/preview-story-upload";
import { storySlideKey, storySlideKeys, storySlidePath, storySlidesBucket } from "@/lib/story-slides-r2";

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
        if (isPreviewStoryCandidate(req)) {
            try {
                const fresh = req.nextUrl.searchParams.get("gallery_candidate") === "fresh";
                const owned = fresh ? await previewStoryOwner(id, userId, true) : await previewStoryOwner(id, userId);
                if (!owned) return Errors.notFound("Itinerary");
                const user = await currentUser();
                if (!user || user.id !== userId) return Errors.unauthorized();
                const tier = await previewStoryTier(userId, user.primaryEmailAddress?.emailAddress ?? null);
                const retentionDays = hasFeature(tier, "storyRetentionDays");
                const form = await readPreviewStoryForm(req);
                const saved = fresh ? await savePreviewStoryMedia(id, userId, form, tier, retentionDays, true)
                    : await savePreviewStoryMedia(id, userId, form, tier, retentionDays);
                if (!saved) return Errors.notFound("Itinerary");
                return NextResponse.json({ success: true, ...saved }, {
                    headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" },
                });
            } catch (error) {
                if (error instanceof RangeError) return Errors.validationError(error.message);
                console.error("[STORY_PREVIEW] Candidate write failed", error);
                return Errors.databaseError();
            }
        }
        const supabase = createSupabaseAdmin();

        // Verify itinerary ownership
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

        // R2 is the served copy (random generation per persist); Supabase Storage stays a dual write until 2026-11-02.
        const bucket = storySlidesBucket();
        const generation = crypto.randomUUID();
        const origin = req.nextUrl.origin;
        const previousKeys = storySlideKeys(id, itinerary.story_slides);
        const storedKeys: string[] = [];

        // Get user tier for retention period
        const tier = await getUserTier(userId);
        const retentionDays = hasFeature(tier, "storyRetentionDays");

        let formData: FormData;
        try {
            formData = await readPreviewStoryForm(req);
        } catch (error) {
            if (error instanceof RangeError) return Errors.validationError(error.message);
            throw error;
        }
        if ([...formData.entries()].length > 32) {
            return Errors.validationError("Invalid story slide count");
        }
        const slides: Record<string, string> = {};
        const errors: string[] = [];
        const now = new Date();

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

            // Match the rendered-image bound already used by the candidate upload.
            if (value.size < 8 || value.size > previewStorySlideBytes) {
                errors.push(`${key}: invalid size (maximum 8MiB)`);
                continue;
            }

            try {
                const buffer = Buffer.from(await value.arrayBuffer());
                const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
                if (!pngHeader.every((byte, index) => buffer[index] === byte)) {
                    errors.push(`${key}: invalid PNG slide`);
                    continue;
                }
                const storageKey = `story-slides/${id}/${key}.png`;
                const r2Key = bucket ? storySlideKey(id, generation, key) : null;
                let r2Stored = false;
                if (bucket && r2Key) {
                    try {
                        await bucket.put(r2Key, new Uint8Array(buffer), { httpMetadata: { contentType: "image/png" } });
                        storedKeys.push(r2Key);
                        r2Stored = true;
                    } catch (r2Error) {
                        console.error(`[STORY_PERSIST] R2 write failed for ${key}:`, r2Error instanceof Error ? r2Error.message : r2Error);
                    }
                }

                const { error: uploadError } = await supabase.storage
                    .from("generated-images")
                    .upload(storageKey, buffer, {
                        contentType: "image/png",
                        upsert: true,
                    });

                if (r2Stored) {
                    if (uploadError) console.error(`[STORY_PERSIST] Supabase dual write failed for ${key}:`, uploadError.message);
                    slides[key] = `${origin}${storySlidePath(id, generation, key)}`;
                    continue;
                }

                if (uploadError) {
                    console.error(`[STORY_PERSIST] Upload failed for ${key}:`, uploadError.message);
                    errors.push(`${key}: upload failed`);
                    continue;
                }

                const { data: urlData, error: urlError } = await supabase.storage
                    .from("generated-images")
                    .createSignedUrl(storageKey, retentionDays * 24 * 60 * 60);

                if (urlError || !urlData?.signedUrl) {
                    errors.push(`${key}: media link unavailable`);
                    continue;
                }
                slides[key] = urlData.signedUrl;
            } catch (err) {
                console.error(`[STORY_PERSIST] Error processing ${key}:`, err);
                errors.push(`${key}: processing error`);
            }
        }

        if (Object.keys(slides).length === 0) {
            return Errors.validationError("No valid slides were uploaded");
        }

        // Calculate expiry from the time captured before link signing.
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
            for (const key of storedKeys) await bucket?.delete(key).catch(() => {});
            return Errors.databaseError();
        }

        // The previous story's R2 objects are no longer referenced.
        for (const key of previousKeys) {
            if (!storedKeys.includes(key)) await bucket?.delete(key).catch((e: unknown) => console.error("[STORY_PERSIST] Old R2 slide delete failed", e));
        }
        console.log(`[STORY_PERSIST] story_media_write=${storedKeys.length ? "r2" : "supabase_only"}`);

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
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        if (isPreviewStoryCandidate(req)) {
            const { userId } = await auth();
            try {
                const story = await previewStorySlides(id, userId);
                if (!story) return Errors.notFound("Itinerary");
                return NextResponse.json(story, {
                    headers: { "Cache-Control": "no-store", "X-Localley-Data-Source": "d1-preview" },
                });
            } catch {
                return Errors.databaseError();
            }
        }
        const supabase = createSupabaseAdmin();

        const { data: itinerary, error } = await supabase
            .from("itineraries")
            .select("story_slides, shared, clerk_user_id")
            .eq("id", id)
            .single();

        if (error || !itinerary) {
            return Errors.notFound("Itinerary");
        }

        if (itinerary.shared !== true) {
            const { userId } = await auth();
            if (!userId || itinerary.clerk_user_id !== userId) return Errors.notFound("Itinerary");
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
        }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("[STORY_PERSIST_GET] Error:", error);
        return handleApiError(error, "story-persist-get");
    }
}
