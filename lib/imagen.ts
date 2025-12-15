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
    numberOfImages?: number; // 1-4, default 1
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
        const response = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [prompt],
            config: {
                responseModalities: ['IMAGE'], // Only return images, no text
                imageConfig: aspectRatio ? {
                    aspectRatio: aspectRatio
                } : undefined
            },
        });

        const images: GeneratedImage[] = [];

        // Extract images from response parts
        for (const part of response.parts || []) {
            if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                images.push({
                    imageBytes: part.inlineData.data || "",
                    mimeType: part.inlineData.mimeType || "image/png",
                });
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
 */
export async function generateStoryBackground(
    city: string,
    theme: string,
    style: "vibrant" | "minimal" | "artistic" = "vibrant"
): Promise<string> {
    const styleDescriptions = {
        vibrant: "vibrant colors, high contrast, eye-catching",
        minimal: "minimalist, soft colors, clean aesthetic",
        artistic: "artistic, painterly, dreamy atmosphere",
    };

    const prompt = `A beautiful ${styleDescriptions[style]} travel background image of ${city}, featuring ${theme}. Perfect for a social media story. No text, no people, just stunning scenery. Professional travel photography style, Instagram-worthy.`;

    const images = await generateImage({ prompt, numberOfImages: 1 });
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

    const prompt = `A beautiful photograph of ${activityName} in ${city}, showing ${categoryContext}. Professional travel photography, high quality, vibrant but natural colors. No text overlays.`;

    const images = await generateImage({ prompt, numberOfImages: 1 });
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

    const images = await generateImage({ prompt, numberOfImages: 1 });
    return images[0]?.imageBytes || "";
}

/**
 * Check if Imagen is available (API key configured)
 */
export function isImagenAvailable(): boolean {
    return !!apiKey;
}
