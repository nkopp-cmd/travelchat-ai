import { GoogleGenAI } from "@google/genai";

// Support both GEMINI_API_KEY (official) and GOOGLE_AI_API_KEY (legacy)
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
    console.warn("GEMINI_API_KEY or GOOGLE_AI_API_KEY is not set. Image generation will be disabled.");
}

// Gemini model with native image generation (aka Nano Banana)
// Fast model optimized for image generation
const IMAGE_MODEL = "gemini-2.5-flash-image";

// Create Google GenAI client
const getGoogleAI = () => {
    if (!apiKey) {
        throw new Error("Google AI API key is not configured");
    }
    return new GoogleGenAI({ apiKey });
};

export interface ImageGenerationOptions {
    prompt: string;
    aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
}

export interface GeneratedImage {
    imageBytes: string; // base64 encoded
    mimeType: string;
}

/**
 * Generate images using Gemini's native image generation (Nano Banana)
 * @param options - Image generation options
 * @returns Array of generated images as base64
 */
export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedImage[]> {
    const { prompt, aspectRatio } = options;

    if (!apiKey) {
        throw new Error("Image generation is not configured. Please add GEMINI_API_KEY or GOOGLE_AI_API_KEY.");
    }

    const ai = getGoogleAI();

    try {
        // Use generateContent with responseModalities for image generation
        // IMPORTANT: aspectRatio must be passed correctly to ensure proper image dimensions
        const config: any = {
            responseModalities: ['IMAGE'], // Only return images, no text
        };

        // Always set imageConfig with aspectRatio to ensure proper dimensions
        if (aspectRatio) {
            config.imageConfig = {
                aspectRatio: aspectRatio
            };
        }

        console.log("[IMAGEN] Generating image with config:", JSON.stringify(config));

        const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [prompt],
            config: config,
        });

        const images: GeneratedImage[] = [];

        // Extract images from response
        // The response structure has candidates array with content.parts
        if (response.candidates && response.candidates.length > 0) {
            for (const candidate of response.candidates) {
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                            const imageData = part.inlineData.data || "";
                            console.log("[IMAGEN] Generated image:", {
                                mimeType: part.inlineData.mimeType,
                                dataLength: imageData.length,
                                requestedAspectRatio: aspectRatio
                            });
                            images.push({
                                imageBytes: imageData,
                                mimeType: part.inlineData.mimeType || "image/png",
                            });
                        }
                    }
                }
            }
        }

        if (images.length === 0) {
            throw new Error("No images were generated");
        }

        return images;
    } catch (error) {
        console.error("Image generation error:", error);
        throw error;
    }
}

/**
 * Generate a travel/city themed background image for stories
 * Optimized for 9:16 aspect ratio (1080x1920 Instagram/TikTok stories)
 */
export async function generateStoryBackground(
    city: string,
    theme: string,
    style: "vibrant" | "minimal" | "artistic" = "vibrant"
): Promise<string> {
    const styleDescriptions = {
        vibrant: "vibrant saturated colors, dramatic lighting, cinematic composition",
        minimal: "minimalist clean design, soft pastel colors, serene atmosphere",
        artistic: "artistic painterly style, dreamy ethereal atmosphere, impressionist",
    };

    // Enhanced prompt for vertical story format with proper composition
    const prompt = `A stunning vertical photograph of ${city} featuring ${theme}.
Composition: vertical 9:16 portrait orientation, shot with professional camera.
Style: ${styleDescriptions[style]}, professional travel photography, award-winning composition.
Features: iconic recognizable landmarks of ${city}, ${theme}, atmospheric depth, golden hour lighting.
Quality: ultra high resolution, sharp focus, National Geographic quality, Instagram-worthy.
Important: NO text, NO people, NO watermarks, NO logos. Pure scenic photography only.
Framing: full frame vertical composition perfect for mobile story format.`;

    const images = await generateImage({
        prompt,
        aspectRatio: "9:16" // Explicit 9:16 for story format
    });
    return images[0]?.imageBytes || "";
}

/**
 * Generate a thumbnail image for a travel activity/spot
 */
export async function generateActivityThumbnail(
    activityName: string,
    category: string,
    city: string
): Promise<string> {
    const categoryPrompts: Record<string, string> = {
        restaurant: "delicious food, cozy interior, warm lighting",
        cafe: "coffee shop atmosphere, aesthetic interior, latte art",
        bar: "nightlife ambiance, cocktails, modern bar interior",
        market: "bustling market stalls, local products, vibrant colors",
        temple: "serene temple architecture, traditional design, peaceful",
        park: "lush greenery, natural beauty, outdoor scenery",
        museum: "artistic interior, cultural exhibits, elegant architecture",
        shopping: "trendy shops, fashion displays, modern retail",
        attraction: "iconic landmark, tourist destination, memorable view",
        neighborhood: "charming streets, local architecture, authentic atmosphere",
    };

    const categoryContext = categoryPrompts[category] || "interesting location, travel destination";

    // Enhanced prompt with composition guidance for consistent quality
    const prompt = `A beautiful photograph of ${activityName} in ${city}, showing ${categoryContext}.
Composition: square 1:1 format, shot with professional camera, centered subject.
Style: professional travel photography, vibrant but natural colors, inviting atmosphere.
Quality: high resolution, sharp focus, Instagram-worthy.
Important: NO text overlays, NO watermarks, NO logos. Pure photography only.`;

    const images = await generateImage({
        prompt,
        aspectRatio: "1:1" // Square thumbnails for cards
    });
    return images[0]?.imageBytes || "";
}

/**
 * Generate an itinerary cover image
 */
export async function generateItineraryCover(
    city: string,
    highlights: string[],
    days: number
): Promise<string> {
    const highlightText = highlights.slice(0, 3).join(", ");

    const prompt = `A stunning travel cover image for a ${days}-day trip to ${city}. The image should evoke ${highlightText}. Beautiful landscape or cityscape, professional travel photography, Instagram-worthy, vibrant colors, no text or people.`;

    const images = await generateImage({
        prompt,
        aspectRatio: "9:16" // Match story format for consistency
    });
    return images[0]?.imageBytes || "";
}

/**
 * Check if Imagen is available (API key configured)
 */
export function isImagenAvailable(): boolean {
    return !!apiKey;
}
