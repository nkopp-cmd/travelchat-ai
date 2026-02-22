import { z } from "zod";

// Chat API validation
export const chatSchema = z.object({
    messages: z.array(
        z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string().min(1).max(10000),
        })
    ).min(1).max(50),
    city: z.string().max(100).optional(),
});

// Itinerary generation validation
export const generateItinerarySchema = z.object({
    city: z.string().min(1).max(100),
    days: z.number().int().min(1).max(14),
    interests: z.array(z.string().max(50)).max(10).optional(),
    budget: z.enum(["budget", "cheap", "moderate", "luxury", "splurge"]).optional(),
    localnessLevel: z.number().int().min(1).max(5).optional(),
    pace: z.enum(["relaxed", "moderate", "active", "packed"]).optional(),
    groupType: z.enum(["solo", "couple", "family", "friends", "business"]).optional(),
    templatePrompt: z.string().max(2000).optional(),
});

// Itinerary save validation
export const saveItinerarySchema = z.object({
    title: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    days: z.number().int().min(1).max(14),
    activities: z.array(z.unknown()).min(1),
    localScore: z.number().int().min(1).max(10).optional(),
    subtitle: z.string().max(500).optional(),
    highlights: z.array(z.string()).optional(),
    estimatedCost: z.string().max(50).optional(),
});

// Itinerary update validation
export const updateItinerarySchema = z.object({
    title: z.string().min(1).max(200).optional(),
    subtitle: z.string().max(500).optional(),
    activities: z.array(z.unknown()).optional(),
    is_favorite: z.boolean().optional(),
    status: z.enum(["draft", "planning", "booked", "completed"]).optional(),
});

// Gamification action validation
export const gamificationActionSchema = z.object({
    action: z.enum([
        "verify",
        "verify_spot",
        "share",
        "share_spot",
        "checkin",
        "discover_spot",
        "create_itinerary",
        "daily_login",
        "streak_bonus",
    ]),
});

// Spot save validation
export const saveSpotSchema = z.object({
    spotId: z.string().uuid(),
});

// ID parameter validation
export const idParamSchema = z.object({
    id: z.string().uuid(),
});

// Conversation messages validation
export const conversationMessageSchema = z.object({
    conversationId: z.string().uuid(),
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(10000),
});

// Share itinerary validation
export const shareItinerarySchema = z.object({
    isPublic: z.boolean(),
});

// Revision request validation
export const reviseItinerarySchema = z.object({
    feedback: z.string().min(1).max(2000),
    currentItinerary: z.object({
        title: z.string(),
        dailyPlans: z.array(z.unknown()),
    }),
});

// Helper to validate and parse request body
export async function validateBody<T>(
    req: Request,
    schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
    try {
        const body = await req.json();
        const result = schema.safeParse(body);

        if (!result.success) {
            const issues = result.error.issues || [];
            const errors = issues.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join(", ");
            return { success: false, error: errors || "Validation failed" };
        }

        return { success: true, data: result.data };
    } catch {
        return { success: false, error: "Invalid JSON body" };
    }
}
