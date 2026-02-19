import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isImagenAvailable } from "@/lib/imagen";
import { isSeedreamAvailable } from "@/lib/seedream";
import { isFluxAvailable } from "@/lib/flux";
import {
    getImageProvider,
    isAnyProviderAvailable,
    generateStoryBackground,
    generateDayBackground,
    type ImageProvider,
} from "@/lib/image-provider";
import {
    getAvailableModels,
    getModelCredits,
    canUseTierModel,
    MODEL_CREDITS,
} from "@/lib/model-credits";

// AI image generation can take 10-20s per image
export const maxDuration = 60;
import {
    getPexelsThemedImage,
    getTripAdvisorThemedImage,
    isPexelsAvailable,
    isTripAdvisorAvailable,
} from "@/lib/story-backgrounds";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { getUserTier, checkAndIncrementUsageWeighted } from "@/lib/usage-tracking";
import { hasFeature } from "@/lib/subscription";
import { Errors, handleApiError } from "@/lib/api-errors";

// Rate limit: 20 story backgrounds per minute per user
const limiter = rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 20,
});

type BackgroundType = "cover" | "day" | "summary";

interface StoryBackgroundRequest {
    type: BackgroundType;
    city: string;
    theme?: string;
    dayNumber?: number;
    activities?: string[];
    // Whether to prefer AI generation (requires Pro/Premium)
    preferAI?: boolean;
    // User-selected AI model (null = auto-select based on priority)
    provider?: ImageProvider;
    // Cache key for storing/retrieving from storage
    cacheKey?: string;
    // URLs to exclude (for duplicate prevention across slides)
    excludeUrls?: string[];
    // Unique per slide to guarantee image variety (cover=0, day1=1, ..., summary=N+1)
    slotIndex?: number;
}

/**
 * Detect actual image format from buffer magic bytes.
 * CRITICAL: Providers may return JPEG, PNG, or WebP regardless of what we request.
 * Uploading with wrong content type causes Satori to fail silently during rendering.
 */
function detectImageContentType(buffer: Buffer): string {
    if (buffer.length < 4) return "image/png";
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return "image/png";
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return "image/jpeg";
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return "image/webp";
    }
    // Default to PNG
    return "image/png";
}

/** Check if a specific AI provider has its API key configured */
function isProviderKeyAvailable(provider: ImageProvider): boolean {
    switch (provider) {
        case "flux": return isFluxAvailable();
        case "seedream": return isSeedreamAvailable();
        case "gemini": return isImagenAvailable();
    }
}

export async function POST(req: NextRequest) {
    try {
        // Check rate limit
        const rateLimitResponse = await limiter(req);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const body: StoryBackgroundRequest = await req.json();
        const { type, city, theme, dayNumber, activities, preferAI = true, provider: requestedProvider, cacheKey, excludeUrls = [] } = body;

        if (!city) {
            return Errors.validationError("city is required");
        }

        // Determine user tier and AI eligibility
        const tier = await getUserTier(userId);
        const hasAiFeature = hasFeature(tier, 'aiBackgrounds');
        const anyProviderAvailable = isAnyProviderAvailable();
        const bypassTierCheck = process.env.BYPASS_IMAGE_TIER_CHECK === "true";

        // Log gate check BEFORE evaluating canUseAI — this always appears in Vercel logs
        console.log("[STORY_BG] Gate check:", {
            tier,
            preferAI,
            hasAiFeature,
            anyProviderAvailable,
            bypassTierCheck,
            fluxKey: isFluxAvailable(),
            seedreamKey: isSeedreamAvailable(),
            geminiKey: isImagenAvailable(),
        });

        let canUseAI = preferAI && anyProviderAvailable && (hasAiFeature || bypassTierCheck);

        // If user explicitly requested a provider, validate tier access
        if (requestedProvider && canUseAI) {
            if (!canUseTierModel(tier, requestedProvider)) {
                return NextResponse.json({
                    success: false,
                    error: `Your ${tier} plan does not include access to ${MODEL_CREDITS[requestedProvider].label}. Upgrade to Premium for all models.`,
                    _debug: { tier, hasAiFeature, anyProviderAvailable, bypassTierCheck },
                }, { status: 403 });
            }
        }

        // Determine credit cost based on provider
        const creditCost = requestedProvider ? getModelCredits(requestedProvider) : 1;

        // Check AI usage quota before attempting generation
        // Permissive: if usage tracking fails, allow generation anyway (don't block user)
        if (canUseAI) {
            try {
                const { allowed, usage } = await checkAndIncrementUsageWeighted(userId, "ai_images_generated", creditCost);
                if (!allowed) {
                    console.log("[STORY_BG] AI quota exceeded, falling through to non-AI sources", {
                        current: usage.currentUsage,
                        limit: usage.limit,
                        creditCost,
                    });
                    canUseAI = false;
                }
            } catch (usageError) {
                // Usage tracking failure should NOT block AI generation
                console.error("[STORY_BG] Usage tracking error (allowing generation anyway):", usageError);
            }
        }

        // Use user-chosen provider or auto-select based on priority
        let imageProvider: ImageProvider | null = canUseAI
            ? (requestedProvider || getImageProvider(tier))
            : null;

        console.log("[STORY_BG] Request:", {
            type,
            city,
            theme,
            dayNumber,
            canUseAI,
            imageProvider,
            tier,
        });

        // Generate a storage key for this background
        const storageKey = cacheKey
            ? `story-backgrounds/${cacheKey}.png`
            : `story-backgrounds/${userId}/${type}${dayNumber ? `-day${dayNumber}` : ''}-${Date.now()}.png`;

        // Check cache first if cacheKey provided
        if (cacheKey) {
            const supabase = createSupabaseAdmin();
            const { data: cached } = await supabase.storage
                .from("generated-images")
                .list("story-backgrounds", { search: `${cacheKey}.png` });

            if (cached && cached.length > 0) {
                const { data: urlData } = supabase.storage
                    .from("generated-images")
                    .getPublicUrl(`story-backgrounds/${cacheKey}.png`);

                if (urlData?.publicUrl) {
                    console.log("[STORY_BG] Returning cached image URL");
                    return NextResponse.json({
                        success: true,
                        image: urlData.publicUrl,
                        source: "cache",
                        cached: true,
                    });
                }
            }
        }

        let imageUrl: string | null = null;
        let source: "ai" | "tripadvisor" | "pexels" = "pexels";
        const failedProviders: Array<{ provider: string; error: string }> = [];

        // =====================================================================
        // AI GENERATION with cascading fallback across all providers
        // =====================================================================
        if (canUseAI) {
            // Build the ordered list: requested provider first, then remaining
            const providerOrder: ImageProvider[] = [];
            if (imageProvider) providerOrder.push(imageProvider);
            const allProviders: ImageProvider[] = ["flux", "seedream", "gemini"];
            for (const p of allProviders) {
                if (!providerOrder.includes(p) && isProviderKeyAvailable(p)) {
                    providerOrder.push(p);
                }
            }

            for (const currentProvider of providerOrder) {
                try {
                    console.log(`[STORY_BG] Attempting AI generation with ${currentProvider}...`);
                    let aiImage: string | null = null;

                    if (type === "day" && dayNumber) {
                        aiImage = await generateDayBackground(
                            currentProvider,
                            city,
                            dayNumber,
                            theme || `Day ${dayNumber} adventures`,
                            activities || []
                        );
                    } else {
                        const bgTheme = type === "cover"
                            ? "iconic landmarks and cityscape"
                            : type === "summary"
                                ? "beautiful travel scenery"
                                : theme || "travel destination";

                        aiImage = await generateStoryBackground(currentProvider, city, bgTheme, "vibrant");
                    }

                    // Check for empty string (Gemini returns "" on failure)
                    if (aiImage && aiImage.length > 100) {
                        imageProvider = currentProvider;
                        source = "ai";
                        console.log(`[STORY_BG] ${currentProvider} succeeded! Image length: ${aiImage.length}`);

                        // Upload AI images to Supabase Storage and return URL
                        const supabase = createSupabaseAdmin();
                        const cleanBase64 = aiImage.replace(/^data:image\/\w+;base64,/, "");
                        const buffer = Buffer.from(cleanBase64, "base64");

                        // Detect actual image format from magic bytes — providers may return
                        // JPEG even when PNG is requested. Using wrong content type causes
                        // Satori to fail silently when building data URIs for rendering.
                        const detectedType = detectImageContentType(buffer);
                        const ext = detectedType === "image/jpeg" ? "jpg" : detectedType === "image/webp" ? "webp" : "png";
                        // Update storage key extension to match actual format
                        const actualStorageKey = storageKey.replace(/\.png$/, `.${ext}`);
                        console.log(`[STORY_BG] Upload: detected ${detectedType}, size ${buffer.length} bytes, key: ${actualStorageKey}`);

                        const { error: uploadError } = await supabase.storage
                            .from("generated-images")
                            .upload(actualStorageKey, buffer, {
                                contentType: detectedType,
                                upsert: true,
                            });

                        if (!uploadError) {
                            const { data: urlData } = supabase.storage
                                .from("generated-images")
                                .getPublicUrl(actualStorageKey);

                            if (urlData?.publicUrl) {
                                imageUrl = urlData.publicUrl;
                                console.log("[STORY_BG] AI image stored, URL:", imageUrl);
                            }
                        } else {
                            console.error("[STORY_BG] Storage upload failed:", {
                                message: uploadError.message,
                                name: uploadError.name,
                                storageKey: actualStorageKey,
                                bufferSize: buffer.length,
                                detectedType,
                            });
                            // Image generated but upload failed — still count as AI success
                            // The base64 can't be returned directly (too large), so fall through
                            failedProviders.push({ provider: currentProvider, error: `Upload failed: ${uploadError.message}` });
                        }
                        break; // AI succeeded — stop trying providers
                    } else {
                        const msg = aiImage ? `Empty response (length: ${aiImage.length})` : "Returned null";
                        console.error(`[STORY_BG] ${currentProvider} returned empty:`, msg);
                        failedProviders.push({ provider: currentProvider, error: msg });
                    }
                } catch (error: unknown) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    // Capture full error details (FAL ApiError has .body, .status)
                    const apiError = error as { status?: number; body?: unknown };
                    const details = apiError.body ? JSON.stringify(apiError.body) : undefined;
                    console.error(`[STORY_BG] ${currentProvider} FAILED:`, {
                        message: errorMsg,
                        status: apiError.status,
                        body: details,
                    });
                    failedProviders.push({
                        provider: currentProvider,
                        error: details ? `${errorMsg} | body: ${details}` : errorMsg,
                    });
                }
            }
        }

        // =====================================================================
        // STOCK PHOTO FALLBACK: TripAdvisor → Pexels (NO Unsplash)
        // =====================================================================

        // Fall back to TripAdvisor for real location photos (paid tiers only)
        if (!imageUrl && tier !== "free" && isTripAdvisorAvailable()) {
            console.log("[STORY_BG] Trying TripAdvisor...");
            const searchTheme = theme || (type === "cover" ? "landmark" : type === "summary" ? "scenery" : "travel");

            imageUrl = await getTripAdvisorThemedImage(city, searchTheme, excludeUrls);
            if (imageUrl) {
                source = "tripadvisor";
                console.log("[STORY_BG] TripAdvisor image found:", imageUrl.substring(0, 80));
            } else {
                console.log("[STORY_BG] TripAdvisor returned no image for:", { city, searchTheme });
            }
        }

        // Fall back to Pexels
        if (!imageUrl && isPexelsAvailable()) {
            console.log("[STORY_BG] Trying Pexels...");
            const searchTheme = theme || (type === "cover" ? "cityscape" : type === "summary" ? "travel scenery" : "travel");

            imageUrl = await getPexelsThemedImage(city, searchTheme, excludeUrls);
            if (imageUrl) {
                source = "pexels";
                console.log("[STORY_BG] Pexels image found:", imageUrl.substring(0, 80));
            } else {
                console.log("[STORY_BG] Pexels returned no image for:", { city, searchTheme });
            }
        }

        // =====================================================================
        // ALL SOURCES FAILED — return error (no more silent Unsplash fallback)
        // =====================================================================
        if (!imageUrl) {
            console.error("[STORY_BG] ALL sources failed:", {
                canUseAI,
                imageProvider,
                tier,
                failedProviders,
                hasFluxKey: isFluxAvailable(),
                hasSeedreamKey: isSeedreamAvailable(),
                hasGeminiKey: isImagenAvailable(),
                hasTripAdvisorKey: isTripAdvisorAvailable(),
                hasPexelsKey: isPexelsAvailable(),
            });

            return NextResponse.json({
                success: false,
                error: "All image providers failed",
                failedProviders,
                _debug: {
                    tier,
                    canUseAI,
                    imageProvider,
                    hasAiFeature,
                    anyProviderAvailable,
                    bypassTierCheck,
                    fluxKey: isFluxAvailable(),
                    seedreamKey: isSeedreamAvailable(),
                    geminiKey: isImagenAvailable(),
                    tripAdvisorKey: isTripAdvisorAvailable(),
                    pexelsKey: isPexelsAvailable(),
                },
            });
        }

        console.log("[STORY_BG] Final result:", { source, type, city, imageUrl: imageUrl.substring(0, 80) });

        return NextResponse.json({
            success: true,
            image: imageUrl,
            source,
            provider: imageProvider,
            cached: false,
            failedProviders: failedProviders.length > 0 ? failedProviders : undefined,
            _debug: { tier, canUseAI, bypassTierCheck, hasAiFeature, anyProviderAvailable },
        });
    } catch (error) {
        console.error("[STORY_BG] Error:", error);
        return handleApiError(error, "story-background");
    }
}

// GET endpoint to check available sources and model info
export async function GET(req: NextRequest) {
    let tier: "free" | "pro" | "premium" = "free";
    try {
        const { userId } = await auth();
        if (userId) {
            tier = await getUserTier(userId);
        }
    } catch {
        // Not authenticated — return free tier info
    }

    const models = getAvailableModels(tier);

    return NextResponse.json({
        sources: {
            ai: isAnyProviderAvailable(),
            flux: isFluxAvailable(),
            seedream: isSeedreamAvailable(),
            gemini: isImagenAvailable(),
            tripadvisor: isTripAdvisorAvailable(),
            pexels: isPexelsAvailable(),
        },
        models,
        tier,
    });
}
