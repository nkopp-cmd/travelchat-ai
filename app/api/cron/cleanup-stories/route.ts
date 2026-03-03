import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/cron/cleanup-stories
 * Daily cron job to delete expired story slides from Supabase Storage.
 * Protected by CRON_SECRET header (set in Vercel environment).
 */
export async function GET(req: NextRequest) {
    // Verify cron secret (Vercel sends this automatically for cron jobs)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const supabase = createSupabaseAdmin();
        const now = new Date().toISOString();

        // Find itineraries with expired story slides
        // story_slides->>'expires_at' is an ISO timestamp string
        const { data: expired, error: queryError } = await supabase
            .from("itineraries")
            .select("id, story_slides")
            .not("story_slides", "is", null)
            .lt("story_slides->expires_at", now);

        if (queryError) {
            console.error("[CLEANUP_STORIES] Query error:", queryError);
            return NextResponse.json({
                success: false,
                error: "Query failed",
            }, { status: 500 });
        }

        if (!expired || expired.length === 0) {
            console.log("[CLEANUP_STORIES] No expired stories found");
            return NextResponse.json({ success: true, cleaned: 0 });
        }

        console.log(`[CLEANUP_STORIES] Found ${expired.length} expired story sets`);

        let cleanedCount = 0;
        let filesDeleted = 0;

        for (const item of expired) {
            const storySlides = item.story_slides as {
                slides: Record<string, string>;
            } | null;

            if (storySlides?.slides) {
                // Delete slide files from Storage
                const filePaths: string[] = [];
                for (const key of Object.keys(storySlides.slides)) {
                    filePaths.push(`story-slides/${item.id}/${key}.png`);
                }

                if (filePaths.length > 0) {
                    const { error: deleteError } = await supabase.storage
                        .from("generated-images")
                        .remove(filePaths);

                    if (deleteError) {
                        console.error(`[CLEANUP_STORIES] Storage delete error for ${item.id}:`, deleteError);
                    } else {
                        filesDeleted += filePaths.length;
                    }
                }
            }

            // Clear story_slides metadata
            const { error: updateError } = await supabase
                .from("itineraries")
                .update({ story_slides: null })
                .eq("id", item.id);

            if (updateError) {
                console.error(`[CLEANUP_STORIES] Update error for ${item.id}:`, updateError);
            } else {
                cleanedCount++;
            }
        }

        console.log(`[CLEANUP_STORIES] Cleaned ${cleanedCount} itineraries, deleted ${filesDeleted} files`);

        return NextResponse.json({
            success: true,
            cleaned: cleanedCount,
            filesDeleted,
            total: expired.length,
        });
    } catch (error) {
        console.error("[CLEANUP_STORIES] Error:", error);
        return NextResponse.json({
            success: false,
            error: "Cleanup failed",
        }, { status: 500 });
    }
}
