/**
 * Debug endpoint: Image Pipeline Diagnostics
 *
 * Returns the status of every component in the AI image generation pipeline.
 * Admin-only — requires authenticated user with lifetime premium email.
 *
 * GET /api/debug/image-pipeline
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isImagenAvailable } from "@/lib/imagen";
import { isSeedreamAvailable } from "@/lib/seedream";
import { isAnyProviderAvailable, getImageProvider } from "@/lib/image-provider";
import { isPexelsAvailable, isTripAdvisorAvailable } from "@/lib/story-backgrounds";
import { getUserTier } from "@/lib/usage-tracking";
import { hasFeature, TIER_CONFIGS } from "@/lib/subscription";
import { createSupabaseAdmin } from "@/lib/supabase";
import { isBetaMode } from "@/lib/early-adopters";

const ADMIN_EMAILS = [
    "nkopp@my-goodlife.com",
    "hello@localley.io",
];

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check admin access
        const supabase = createSupabaseAdmin();
        const { data: userData } = await supabase
            .from("users")
            .select("email")
            .eq("clerk_id", userId)
            .single();

        const userEmail = userData?.email?.toLowerCase() || "";
        const isAdmin = ADMIN_EMAILS.includes(userEmail) || isBetaMode();

        if (!isAdmin) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        // Get user tier
        const tier = await getUserTier(userId);
        const imageProvider = getImageProvider(tier);

        // Check Supabase Storage bucket
        let bucketStatus: "exists" | "missing" | "error" = "error";
        try {
            const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
            if (bucketsError) {
                bucketStatus = "error";
                console.error("[DEBUG] Bucket list error:", bucketsError);
            } else if (buckets) {
                const found = buckets.find((b: { id: string }) => b.id === "generated-images");
                bucketStatus = found ? "exists" : "missing";
            }
        } catch (e) {
            console.error("[DEBUG] Bucket check failed:", e);
            bucketStatus = "error";
        }

        // Try a test upload to the bucket (if it exists)
        let uploadTest: "success" | "failed" | "skipped" = "skipped";
        if (bucketStatus === "exists") {
            try {
                const testBuffer = Buffer.from("test", "utf-8");
                const testKey = `debug-test-${Date.now()}.txt`;
                const { error: uploadError } = await supabase.storage
                    .from("generated-images")
                    .upload(testKey, testBuffer, { contentType: "text/plain", upsert: true });
                if (uploadError) {
                    uploadTest = "failed";
                    console.error("[DEBUG] Test upload failed:", uploadError);
                } else {
                    uploadTest = "success";
                    // Clean up test file
                    await supabase.storage.from("generated-images").remove([testKey]);
                }
            } catch (e) {
                uploadTest = "failed";
                console.error("[DEBUG] Test upload exception:", e);
            }
        }

        // Check AI feature access for this tier
        const aiBackgrounds = hasFeature(tier, "aiBackgrounds");
        const tierImageProvider = TIER_CONFIGS[tier]?.features?.imageProvider;

        const report = {
            timestamp: new Date().toISOString(),
            user: {
                clerkId: userId,
                email: userEmail,
                tier,
                isPaid: tier !== "free",
                aiBackgroundsEnabled: aiBackgrounds,
                configuredImageProvider: tierImageProvider,
                effectiveImageProvider: imageProvider,
            },
            environment: {
                GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "missing",
                GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY ? "set" : "missing",
                FAL_KEY: process.env.FAL_KEY ? "set" : "missing",
                PEXELS_API_KEY: process.env.PEXELS_API_KEY ? "set" : "missing",
                TRIPADVISOR_API_KEY: process.env.TRIPADVISOR_API_KEY ? "set" : "missing",
                BETA_MODE: process.env.BETA_MODE || "missing",
                NODE_ENV: process.env.NODE_ENV || "missing",
            },
            providers: {
                gemini: isImagenAvailable(),
                seedream: isSeedreamAvailable(),
                anyAI: isAnyProviderAvailable(),
                tripadvisor: isTripAdvisorAvailable(),
                pexels: isPexelsAvailable(),
                unsplash: true,
            },
            supabase: {
                connected: true,
                generatedImagesBucket: bucketStatus,
                uploadTest,
            },
            analysis: {
                wouldAttemptAI: isAnyProviderAvailable() && !!aiBackgrounds,
                wouldUseTripAdvisor: isTripAdvisorAvailable() && tier !== "free",
                wouldUsePexels: isPexelsAvailable(),
                fallbackOnly: !isAnyProviderAvailable() && !isTripAdvisorAvailable() && !isPexelsAvailable(),
                reason: !isAnyProviderAvailable()
                    ? "No AI provider available (API keys not detected by runtime)"
                    : !aiBackgrounds
                        ? `AI backgrounds disabled for tier: ${tier}`
                        : bucketStatus === "missing"
                            ? "generated-images bucket missing in Supabase Storage"
                            : uploadTest === "failed"
                                ? "Cannot upload to generated-images bucket (permissions?)"
                                : "Pipeline should work - check Vercel logs for [STORY_BG] entries",
            },
        };

        return NextResponse.json(report, {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("[DEBUG] image-pipeline error:", error);
        return NextResponse.json({
            error: "Diagnostic failed",
            details: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
    }
}
