import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { isImagenAvailable } from "@/lib/imagen";
import { isSeedreamAvailable } from "@/lib/seedream";
import { isFluxAvailable } from "@/lib/flux";
import { isGptImageAvailable, GPT_IMAGE_MODEL, GPT_IMAGE_PROMPT_REVISION } from "@/lib/gpt-image";
import {
    getImageProvider, isAnyProviderAvailable, generateStoryBackground, generateDayBackground,
    type ImageProvider,
} from "@/lib/image-provider";
import { getAvailableModels, getModelCredits, canUseTierModel } from "@/lib/model-credits";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { getUserTier } from "@/lib/usage-tracking";
import { reserveStoryImageJob, submitStoryImageJob, settleStoryImageJob } from "@/lib/story-image-jobs";
import { hasFeature, TIER_CONFIGS } from "@/lib/subscription";
import { Errors } from "@/lib/api-errors";

export const maxDuration = 60;
const limiter = rateLimit({ windowMs: 60 * 1000, maxRequests: 20 });
const requestSchema = z.object({
    type: z.enum(["cover", "day", "summary"]),
    city: z.string().trim().min(1).max(200),
    theme: z.string().trim().max(500).optional(),
    dayNumber: z.number().int().min(1).max(365).optional(),
    activities: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
    preferAI: z.boolean().default(true),
    provider: z.enum(["flux", "seedream", "gemini", "gpt-image-2"]).nullable().optional(),
    cacheKey: z.string().min(1).max(256).optional(),
    excludeUrls: z.array(z.string().max(4096)).max(100).default([]),
    slotIndex: z.number().int().min(0).max(366).optional(),
}).refine(body => body.type !== "day" || body.dayNumber !== undefined);

// Bump these revisions when the corresponding model or prompt changes.
const cacheVersions: Record<ImageProvider, readonly string[]> = {
    flux: ["fal-ai/flux-2-flex", "story-background-v1"],
    seedream: ["seedream-4-5-251128", "story-background-v1"],
    gemini: ["gemini-2.5-flash-image", "story-background-v1"],
    "gpt-image-2": [GPT_IMAGE_MODEL, GPT_IMAGE_PROMPT_REVISION],
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const failure = (error: string, status = 200) => NextResponse.json({ success: false, error }, { status });

function isProviderAvailable(provider: ImageProvider): boolean {
    switch (provider) {
        case "flux": return isFluxAvailable();
        case "seedream": return isSeedreamAvailable();
        case "gemini": return isImagenAvailable();
        case "gpt-image-2": return isGptImageAvailable();
        default: return false;
    }
}

function decodeImage(image: string): { buffer: Buffer; contentType: string; ext: string } | null {
    const maxBytes = 10 * 1024 * 1024;
    if (typeof image !== "string" || image.length > 4 * Math.ceil(maxBytes / 3) + 64) return null;
    const base64 = image.replace(/^data:image\/(?:png|jpeg|jpg);base64,/, "");
    if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length < 8 || buffer.length > maxBytes || buffer.toString("base64") !== base64) return null;
    // Satori cannot render WebP. Never infer PNG from unknown bytes or MIME headers.
    if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        return { buffer, contentType: "image/png", ext: "png" };
    }
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
        return { buffer, contentType: "image/jpeg", ext: "jpg" };
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const { userId } = await auth();
        if (!userId) return Errors.unauthorized();
        const limited = await limiter(req);
        if (limited) return limited;

        let json: unknown;
        try { json = await req.json(); } catch { return Errors.validationError("Invalid JSON body"); }
        const parsed = requestSchema.safeParse(json);
        if (!parsed.success) return Errors.validationError("Invalid story background request");
        const { type, city, theme, dayNumber, activities, preferAI, provider: requestedProvider,
            cacheKey, excludeUrls, slotIndex } = parsed.data;

        // Availability is independent of tier bypass and must also guard cache access.
        if (requestedProvider && !isProviderAvailable(requestedProvider)) {
            return failure("The requested image provider is disabled or unavailable.", 503);
        }
        if (!preferAI) return failure("AI generation was not requested. A gradient will be used.");
        const tier = await getUserTier(userId);
        if (requestedProvider && !canUseTierModel(tier, requestedProvider)) {
            return failure("Your plan does not include the requested image provider.", 403);
        }
        if (!hasFeature(tier, "aiBackgrounds") && process.env.BYPASS_IMAGE_TIER_CHECK !== "true") {
            return failure("Your plan does not include AI backgrounds. A gradient will be used.");
        }
        const provider = requestedProvider ?? getImageProvider(tier);
        if (!provider || !isProviderAvailable(provider) || !canUseTierModel(tier, provider)) {
            return failure("No eligible image provider is available. A gradient will be used.");
        }
        const creditCost = getModelCredits(provider);
        if (!Number.isSafeInteger(creditCost) || creditCost <= 0) {
            return failure("Image credit configuration is unavailable.", 503);
        }

        // Only hashes become path components. Never read legacy, shared cache entries.
        const identity = hash(JSON.stringify({
            provider, version: cacheVersions[provider], type, city, theme: theme ?? null,
            dayNumber: dayNumber ?? null, activities: activities ?? [], slotIndex: slotIndex ?? null,
            clientCacheKey: cacheKey ?? null,
        }));
        const directory = `story-backgrounds/v2/${hash(userId)}/${identity}`;
        const storage = createSupabaseAdmin().storage.from("generated-images");
        if (cacheKey) {
            const { data: cached, error } = await storage.list(directory, { search: "background.", limit: 100 });
            if (error || !Array.isArray(cached) || cached.some(file => !file || typeof file.name !== "string")) {
                return failure("Image cache is unavailable. Please try again later.", 503);
            }
            for (const ext of ["png", "jpg"]) {
                const name = `background.${ext}`;
                if (!cached.some(file => file.name === name)) continue;
                const { data } = storage.getPublicUrl(`${directory}/${name}`);
                if (!data?.publicUrl || !/^https:\/\/[^/?#]+\/[^?#]+$/.test(data.publicUrl) ||
                    !data.publicUrl.endsWith(`/${directory}/${name}`)) {
                    return failure("Image cache configuration is unavailable.", 503);
                }
                if (!excludeUrls.includes(data.publicUrl)) {
                    return NextResponse.json({ success: true, image: data.publicUrl, source: "cache", cached: true });
                }
            }
        }

        const payloadHash = hash(JSON.stringify({ identity, excludeUrls: [...new Set(excludeUrls)].sort() }));
        const key = `${provider}:${payloadHash}`;
        // New outputs are not visible through the legacy cache before durable settlement.
        const uploadDirectory = `story-backgrounds/v3/${hash(userId)}/${payloadHash}`;
        const outputPrefix = storage.getPublicUrl(`${uploadDirectory}/background.`).data?.publicUrl;
        if (!outputPrefix || !/^https:\/\/[^/?#]+\/[^?#]+\/background\.$/.test(outputPrefix) ||
            !outputPrefix.endsWith(`/${uploadDirectory}/background.`)) {
            return failure("Image storage configuration is unavailable.", 503);
        }
        const pending = () => NextResponse.json({ success: false, pending: true,
            error: "Image processing is pending. Please check again later." }, { status: 202 });
        let job;
        try {
            job = await reserveStoryImageJob({ userId, key, payloadHash, provider, credits: creditCost,
                limit: TIER_CONFIGS[tier].limits.aiImagesPerMonth, outputPrefix });
        } catch {
            return failure("Image credit tracking is unavailable. Please try again later.", 503);
        }
        if (job.state === "limit") return failure("Image credit limit reached. A gradient will be used.");
        if (job.state === "failed") return NextResponse.json({ success: false, state: "failed",
            error: "This image attempt failed. Generate again to start a new attempt." });
        if (job.state === "succeeded") {
            if (!job.output_url || excludeUrls.includes(job.output_url)) return failure("Image output is unavailable.", 503);
            return NextResponse.json({ success: true, image: job.output_url, source: "ai", provider, cached: false });
        }
        if (!job.owner_token) return pending();
        try { await submitStoryImageJob(userId, key, job.owner_token); } catch { return pending(); }

        // One charged attempt only, including auto mode. No paid provider cascade.
        let outputUrl: string;
        try {
            const image = type === "day"
                ? await generateDayBackground(provider, city, dayNumber!, theme || `Day ${dayNumber} adventures`, activities ?? [])
                : await generateStoryBackground(provider, city,
                    type === "cover" ? "iconic landmarks and cityscape" : "beautiful travel scenery", "vibrant");
            const decoded = decodeImage(image);
            if (!decoded) throw new Error("Unsupported image");
            const path = `${uploadDirectory}/background.${decoded.ext}`;
            const { error } = await storage.upload(path, decoded.buffer, { contentType: decoded.contentType, upsert: true });
            if (error) throw new Error("Storage failed");
            const { data } = storage.getPublicUrl(path);
            if (data?.publicUrl !== `${outputPrefix}${decoded.ext}` || excludeUrls.includes(data.publicUrl)) throw new Error("Invalid output");
            outputUrl = data.publicUrl;
        } catch {
            try { await settleStoryImageJob(userId, key, job.owner_token, null); } catch { return pending(); }
            return NextResponse.json({ success: false, state: "failed",
                error: "Image generation failed. Your reserved credits were returned. A gradient will be used." });
        }
        // A lost settlement response is uncertain, not a generation failure. Never refund here.
        try { await settleStoryImageJob(userId, key, job.owner_token, outputUrl); } catch { return pending(); }
        return NextResponse.json({ success: true, image: outputUrl, source: "ai", provider, cached: false });
    } catch {
        return failure("The image service is unavailable. Please try again later.", 503);
    }
}

export async function GET() {
    let tier: "free" | "pro" | "premium" = "free";
    try {
        const { userId } = await auth();
        if (userId) tier = await getUserTier(userId);
    } catch {
        // Public discovery defaults to free access when authentication is unavailable.
    }
    return NextResponse.json({
        sources: {
            ai: isAnyProviderAvailable(), flux: isFluxAvailable(), seedream: isSeedreamAvailable(),
            gemini: isImagenAvailable(), gptImage2: isGptImageAvailable(),
        },
        models: getAvailableModels(tier), tier,
        videoUiEnabled: process.env.ENABLE_MINIMAX_H3 === "true"
            && process.env.ENABLE_STORY_VIDEO_PROCESSING === "true"
            && process.env.STORY_VIDEO_DELIVERY_READY === "true"
            && !!process.env.MINIMAX_API_KEY?.trim(),
    });
}
