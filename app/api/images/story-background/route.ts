import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
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

import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { getUserTier, checkAndIncrementUsageWeighted } from "@/lib/usage-tracking";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { previewUserTier } from "@/lib/app-data/preview-user-tier";
import { previewBackgroundOwner, readPreviewBackgroundBody, backgroundCacheHash, cachedPreviewBackground, savePreviewBackground, PreviewBackgroundUnavailable } from "@/lib/app-data/preview-story-background-cache";
import { incrementPreviewStoryUsage } from "@/lib/app-data/preview-story-usage";
import { TIER_CONFIGS } from "@/lib/subscription";
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

async function storyBackgroundPost(req: NextRequest) {
    const candidate = isPreviewStoryCandidate(req);
    try {
        // Check rate limit
        const rateLimitResponse = candidate ? null : await limiter(req);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        const { userId } = await auth();
        if (!userId) {
            return Errors.unauthorized();
        }

        const body: StoryBackgroundRequest | null = candidate ? await readPreviewBackgroundBody(req) : await req.json();
        if (!body) return Errors.validationError("Invalid bounded background request");
        const candidateOwner = candidate ? await previewBackgroundOwner(userId) : null;
        const candidateHash = candidate ? backgroundCacheHash(body) : null;
        if (candidateOwner && candidateHash) {
            const cached = await cachedPreviewBackground(candidateOwner, candidateHash);
            if (cached) return NextResponse.json({ success: true, image: cached, source: "cache", cached: true });
        }
        const { type, city, theme, dayNumber, activities, preferAI = true, provider: requestedProviderRaw, cacheKey, excludeUrls = [] } = body;
        const requestedProvider = requestedProviderRaw;

        if (!city) {
            return Errors.validationError("city is required");
        }

        // Determine user tier and AI eligibility
        const tier = candidate ? await previewUserTier(userId) : await getUserTier(userId);
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
        if (canUseAI && !candidate) {
            try {
                const { allowed, usage } = await checkAndIncrementUsageWeighted(userId, "ai_images_generated", creditCost);
                if (!allowed) {
                    console.log("[STORY_BG] AI quota exceeded, branded gradient will be used", {
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
        if (cacheKey && !candidate) {
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
        const source = "ai";
        const failedProviders: Array<{ provider: string; error: string }> = [];

        // =====================================================================
        // AI GENERATION — respect user's model choice (no silent fallback)
        // =====================================================================
        if (canUseAI) {
            if (candidate && process.env.PREVIEW_STORY_GENERATION_ENABLED !== "true") {
                return NextResponse.json({ success: false, error: "Preview generation is disabled" }, { status: 503 });
            }
            const providerOrder: ImageProvider[] = [];
            if (requestedProvider) {
                // User explicitly chose a model — use ONLY that provider.
                // If it fails, skip stock photos too → branded gradient fallback.
                providerOrder.push(imageProvider!);
            } else {
                // Auto-select mode: try all available providers in priority order
                if (imageProvider && (!candidate || canUseTierModel(tier, imageProvider))) providerOrder.push(imageProvider);
                const allProviders: ImageProvider[] = ["flux", "seedream", "gemini"];
                for (const p of allProviders) {
                    if (!providerOrder.includes(p) && isProviderKeyAvailable(p) && (!candidate || canUseTierModel(tier, p))) {
                        providerOrder.push(p);
                    }
                }
            }

            for (const currentProvider of providerOrder) {
                if (candidateOwner) {
                    // Each attempted provider uses its actual weight, including automatic fallback.
                    // A cache hit has already returned. Quota failures never permit generation.
                    const usage = await incrementPreviewStoryUsage(candidateOwner, getModelCredits(currentProvider), TIER_CONFIGS[tier].limits.aiImagesPerMonth);
                    if (!usage.allowed) return NextResponse.json({ success: false, error: "Image credit limit reached", usage }, { status: 429 });
                }
                try {
                    console.log(`[STORY_BG] Attempting AI generation with ${currentProvider}...`);
                    let aiImage: string | null = null;

                    if (type === "day" && dayNumber) {
                        aiImage = await generateDayBackground(
                            currentProvider,
                            city,
                            dayNumber,
                            theme || `Day ${dayNumber} adventures`,
                            activities || [],
                            candidate ? { singleSubmission: true } : undefined
                        );
                    } else {
                        const bgTheme = type === "cover"
                            ? "iconic landmarks and cityscape"
                            : type === "summary"
                                ? "beautiful travel scenery"
                                : theme || "travel destination";

                        aiImage = await generateStoryBackground(currentProvider, city, bgTheme, "vibrant", candidate ? { singleSubmission: true } : undefined);
                    }

                    // Check for empty string (Gemini returns "" on failure)
                    if (aiImage && aiImage.length > 100) {
                        imageProvider = currentProvider;
                        console.log(`[STORY_BG] ${currentProvider} succeeded! Image length: ${aiImage.length}`);

                        // Store candidate bytes privately in R2; keep the normal Supabase path.
                        const supabase = candidate ? null : createSupabaseAdmin();
                        const cleanBase64 = aiImage.replace(/^data:image\/\w+;base64,/, "");
                        const buffer = Buffer.from(cleanBase64, "base64");

                        // Detect actual image format from magic bytes — providers may return
                        // JPEG even when PNG is requested. Using wrong content type causes
                        // Satori to fail silently when building data URIs for rendering.
                        const detectedType = detectImageContentType(buffer);

                        // Satori does NOT support WebP — reject and try next provider
                        if (detectedType === "image/webp") {
                            console.error(`[STORY_BG] ${currentProvider} returned WebP — rejected (Satori incompatible)`);
                            failedProviders.push({ provider: currentProvider, error: "Returned WebP (unsupported by Satori)" });
                            continue;
                        }

                        const ext = detectedType === "image/jpeg" ? "jpg" : "png";
                        // Update storage key extension to match actual format
                        const actualStorageKey = storageKey.replace(/\.png$/, `.${ext}`);
                        console.log(`[STORY_BG] Upload: detected ${detectedType}, size ${buffer.length} bytes, key: ${actualStorageKey}`);

                        if (candidateOwner && candidateHash) {
                            imageUrl = await savePreviewBackground(candidateOwner, candidateHash, buffer);
                        } else if (supabase) {
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
                        }
                        break; // AI succeeded — stop trying providers
                    } else {
                        const msg = aiImage ? `Empty response (length: ${aiImage.length})` : "Returned null";
                        console.error(`[STORY_BG] ${currentProvider} returned empty:`, msg);
                        failedProviders.push({ provider: currentProvider, error: msg });
                    }
                } catch (error: unknown) {
                    if (candidate && error instanceof PreviewBackgroundUnavailable) {
                        return NextResponse.json({ success: false, error: "Preview background storage unavailable" }, { status: 503 });
                    }
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
        // NO IMAGE — branded gradient fallback will be used by story renderer
        // =====================================================================
        if (!imageUrl) {
            const reason = requestedProvider
                ? `${requestedProvider} failed — branded gradient will be used`
                : "All image providers failed";
            console.error("[STORY_BG] No image:", {
                reason,
                requestedProvider,
                canUseAI,
                imageProvider,
                tier,
                failedProviders,
                hasFluxKey: isFluxAvailable(),
                hasSeedreamKey: isSeedreamAvailable(),
                hasGeminiKey: isImagenAvailable(),
            });

            return NextResponse.json({
                success: false,
                error: reason,
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
        if (candidate) return NextResponse.json({ success: false, error: "Preview background unavailable" }, { status: 503 });
        return handleApiError(error, "story-background");
    }
}

export async function POST(req: NextRequest) {
    const response = await storyBackgroundPost(req);
    if (isPreviewStoryCandidate(req)) {
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("X-Localley-Data-Source", "d1-preview");
    }
    return response;
}

// GET endpoint to check available sources and model info
export async function GET(req: NextRequest) {
    let tier: "free" | "pro" | "premium" = "free";
    try {
        const { userId } = await auth();
        if (userId) {
            tier = isPreviewStoryCandidate(req) ? await previewUserTier(userId) : await getUserTier(userId);
        }
    } catch {
        if (isPreviewStoryCandidate(req)) return NextResponse.json({ error: "Preview tier unavailable" }, { status: 503 });
        // Not authenticated — return free tier info
    }

    const models = getAvailableModels(tier);

    return NextResponse.json({
        sources: {
            ai: isAnyProviderAvailable(),
            flux: isFluxAvailable(),
            seedream: isSeedreamAvailable(),
            gemini: isImagenAvailable(),
        },
        models,
        tier,
    });
}
