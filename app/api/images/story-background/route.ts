import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { getAvailableModels } from "@/lib/model-credits";
import { rateLimit } from "@/lib/rate-limit";
import { libraryStoryBackgroundForSlide, sanitizePickerDays } from "@/lib/image-library";
import { getUserTier } from "@/lib/usage-tracking";
import { isPreviewStoryCandidate } from "@/lib/app-data/preview-story-candidate";
import { previewUserTier } from "@/lib/app-data/preview-user-tier";
import { previewBackgroundOwner, readPreviewBackgroundBody, backgroundCacheHash, cachedPreviewBackground } from "@/lib/app-data/preview-story-background-cache";
import { hasFeature } from "@/lib/subscription";
import { Errors, handleApiError } from "@/lib/api-errors";

/**
 * Story backgrounds come ONLY from the pre-generated photo library (lib/image-library.json, made on the ChatGPT
 * plan). No paid image API and no live generation per request (Nils 2026-11-14, APPROVALS.md). The client sends the
 * whole trip (`days`: each spot's category and time); the picker gives each slide the image that fits its day, with
 * no repeat inside the trip. Library images are free, so no credit is charged. Free tier keeps the branded gradient.
 */

// Rate limit: 20 story backgrounds per minute per user
const limiter = rateLimit({
    windowMs: 60 * 1000,
    maxRequests: 20,
});

type BackgroundType = "cover" | "day" | "summary";

interface StoryBackgroundRequest {
    type: BackgroundType;
    city: string;
    dayNumber?: number;
    // Whether to use painted backgrounds (requires Pro/Premium)
    preferAI?: boolean;
    // URLs to exclude (for duplicate prevention across slides)
    excludeUrls?: string[];
    // The whole trip: per day, each spot's category + time (never names). Same list on every slide request.
    days?: unknown;
}

async function storyBackgroundPost(req: NextRequest) {
    const candidate = isPreviewStoryCandidate(req);
    try {
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
        const days = sanitizePickerDays(body.days);
        const candidateOwner = candidate ? await previewBackgroundOwner(userId) : null;
        const candidateHash = candidate ? backgroundCacheHash({ ...body, days: days ?? undefined }) : null;
        if (candidate && (!candidateOwner || !candidateHash)) return Errors.forbidden();
        if (candidateOwner && candidateHash) {
            const cached = await cachedPreviewBackground(candidateOwner, candidateHash);
            if (cached) return NextResponse.json({ success: true, image: cached, source: "cache", cached: true });
        }
        const { type, city, dayNumber, preferAI = true, excludeUrls = [] } = body;

        if (!city) {
            return Errors.validationError("city is required");
        }

        const tier = candidate ? await previewUserTier(userId) : await getUserTier(userId);
        const allowed = hasFeature(tier, "aiBackgrounds") || process.env.BYPASS_IMAGE_TIER_CHECK === "true";

        if (preferAI && allowed) {
            const exclude = Array.isArray(excludeUrls) ? excludeUrls.filter((u): u is string => typeof u === "string") : [];
            const image = libraryStoryBackgroundForSlide(city, type, dayNumber, days, exclude);
            if (image) {
                return NextResponse.json({ success: true, image, source: "library", cached: true });
            }
        }

        return NextResponse.json({
            success: false,
            error: "No background — branded gradient will be used",
            _debug: { tier, preferAI, allowed },
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
            ai: true,
            library: true,
        },
        models,
        tier,
    });
}
