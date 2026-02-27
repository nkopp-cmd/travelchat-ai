import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rate-limit";
import { chatSchema, validateBody } from "@/lib/validations";
import { checkAndIncrementUsage } from "@/lib/usage-tracking";
import { Errors, handleApiError } from "@/lib/api-errors";
import { createSupabaseAdmin } from "@/lib/supabase";
import { getLocalizedText } from "@/lib/spots/transform";
import { ALL_CITIES, LOCALNESS_LABELS } from "@/lib/cities";
import type { MultiLanguageField } from "@/types";

const CLAUDE_MODEL = process.env.CHAT_MODEL || "claude-sonnet-4-20250514";

const getAnthropicClient = () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('Anthropic API key is not configured');
    }
    return new Anthropic({ apiKey });
};

// Rate limit: 20 requests per minute per user
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
});

// All supported city names for detection
const CITY_NAMES = ALL_CITIES.map(c => c.name.toLowerCase());
const CITY_ALIASES: Record<string, string> = {
    "saigon": "ho chi minh city",
    "hcmc": "ho chi minh city",
    "kl": "kuala lumpur",
    "bkk": "bangkok",
    "sg": "singapore",
    "hk": "hong kong",
};

/**
 * Extract city name from message text
 */
function detectCityFromMessages(messages: Array<{ role: string; content: string }>): string | null {
    // Search messages in reverse (most recent first)
    for (let i = messages.length - 1; i >= 0; i--) {
        const text = messages[i].content.toLowerCase();

        // Check aliases first
        for (const [alias, cityName] of Object.entries(CITY_ALIASES)) {
            if (text.includes(alias)) {
                return cityName;
            }
        }

        // Check city names
        for (const city of ALL_CITIES) {
            if (text.toLowerCase().includes(city.name.toLowerCase())) {
                return city.name;
            }
        }
    }
    return null;
}

/**
 * Query Supabase for relevant spots based on city and user's question
 */
async function fetchRelevantSpots(city: string, userMessage: string): Promise<string> {
    try {
        const supabase = createSupabaseAdmin();

        // Find matching city config
        const cityConfig = ALL_CITIES.find(c => c.name.toLowerCase() === city.toLowerCase());
        if (!cityConfig) return "";

        // Build query — get top spots for this city, prioritizing high localley scores
        let query = supabase
            .from("spots")
            .select("name, description, address, category, subcategories, localley_score, local_percentage, best_time, tips, photos")
            .ilike("address->>en", `%${cityConfig.name}%`)
            .order("localley_score", { ascending: false })
            .order("local_percentage", { ascending: false })
            .limit(20);

        // Try to filter by category based on user message keywords
        const categoryKeywords: Record<string, string[]> = {
            "Food": ["eat", "food", "lunch", "dinner", "breakfast", "brunch", "restaurant", "meal", "hungry", "cuisine", "dining"],
            "Cafe": ["cafe", "coffee", "tea", "dessert", "cake", "pastry", "bakery"],
            "Nightlife": ["bar", "drink", "cocktail", "nightlife", "pub", "club", "night out", "beer", "wine"],
            "Shopping": ["shop", "shopping", "buy", "store", "market", "souvenir", "clothes", "fashion"],
            "Outdoor": ["park", "outdoor", "walk", "hike", "nature", "garden", "kids", "children", "family", "playground"],
            "Market": ["market", "street food", "stall", "vendor"],
        };

        const lowerMessage = userMessage.toLowerCase();
        const matchedCategories: string[] = [];
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            if (keywords.some(kw => lowerMessage.includes(kw))) {
                matchedCategories.push(category);
            }
        }

        if (matchedCategories.length > 0) {
            query = supabase
                .from("spots")
                .select("name, description, address, category, subcategories, localley_score, local_percentage, best_time, tips, photos")
                .ilike("address->>en", `%${cityConfig.name}%`)
                .in("category", matchedCategories)
                .order("localley_score", { ascending: false })
                .order("local_percentage", { ascending: false })
                .limit(15);
        }

        const { data: spots, error } = await query;

        if (error || !spots || spots.length === 0) {
            return "";
        }

        // Format spots into a context block for the AI
        const spotLines = spots.map((spot) => {
            const name = getLocalizedText(spot.name as MultiLanguageField);
            const desc = getLocalizedText(spot.description as MultiLanguageField);
            const addr = getLocalizedText(spot.address as MultiLanguageField);
            const score = spot.localley_score || 3;
            const scoreLabel = LOCALNESS_LABELS[score] || "Mixed Crowd";
            const bestTime = spot.best_time || "";
            const category = spot.category || "";
            const localPct = spot.local_percentage || 50;
            const tips = Array.isArray(spot.tips) ? spot.tips.slice(0, 2).join("; ") : "";
            const hasPhotos = Array.isArray(spot.photos) && spot.photos.length > 0;

            return `- ${name} [${category}] (${scoreLabel}, ${score}/6, ${localPct}% locals)
  Address: ${addr}
  ${desc ? `Description: ${desc.substring(0, 150)}` : ""}
  ${bestTime ? `Best time: ${bestTime}` : ""}
  ${tips ? `Tips: ${tips}` : ""}
  ${hasPhotos ? "Has photos" : ""}`;
        }).join("\n");

        return `\n\n## CURATED SPOTS DATABASE — Real verified places in ${cityConfig.name}\nUse these REAL spots in your recommendations when relevant. These are verified, curated places from our database:\n\n${spotLines}\n\nIMPORTANT: Prefer recommending these verified spots over places from your training data. If you recommend a spot from this list, use the exact name and address shown.`;
    } catch (error) {
        console.error("[CHAT] Error fetching spots:", error);
        return "";
    }
}

function buildSystemPrompt(city: string | null, spotsContext: string): string {
    const cityList = ALL_CITIES.map(c => c.name).join(", ");

    return `You are Alley, a savvy local friend from the Localley app who helps travelers discover authentic hidden gems and trendy alley spots.

PERSONALITY:
- Enthusiastic about genuine local experiences
- Slightly sassy about obvious tourist traps (but kind about it)
- Encouraging and celebratory when users find hidden gems
- Honest — you admit when you're unsure rather than guessing
- Uses casual, friendly language

CRITICAL RULES — NEVER BREAK THESE:

1. NEVER FABRICATE PLACES. Do not invent restaurant names, park names, or addresses. If you don't have verified information about a specific place, say so honestly. Do NOT create fictional names like "Jungle Palace" or "Whimsical Woods".

2. NEVER USE PLACEHOLDER TEXT. Never write "YourCity", "Downtown", "[City]", or any placeholder in a recommendation. Every place name and address must be real.

3. ASK FOR CITY FIRST. If the user hasn't mentioned which city they're in or asking about, ask them before giving location-specific recommendations. Say something like: "Love to help! Which city are you exploring? I know ${city ? city + " really well, but I also cover " : ""}${ALL_CITIES.slice(0, 6).map(c => c.name).join(", ")}, and more."

4. DISTINGUISH CHAIN vs LOCAL. Never label a chain restaurant or franchise as "Hidden Gem" or "Local Favorite". Chains like Nolboo, Outback, TGI Fridays, etc. are chains — say so if you mention them. Reserve "Hidden Gem" and "Legendary Alley" only for genuinely independent, lesser-known spots.

5. BE HONEST ABOUT CONFIDENCE. If you're confident a place exists and is good, recommend it enthusiastically. If you're less sure, say "I've heard good things about..." or "You might want to check if X is still open." Never present uncertain knowledge as fact.

SUPPORTED CITIES: ${cityList}
${city ? `\nCURRENT CITY CONTEXT: The user is asking about ${city}.` : ""}

When ranking spots, use the Localley Scale:
1. Tourist Trap — Warn users unless they insist
2. Tourist Friendly — Mention better alternatives
3. Mixed Crowd — Acceptable but not special
4. Local Favorite — Recommend enthusiastically
5. Hidden Gem — Celebrate the discovery!
6. Legendary Alley — Rare finds, make it special!

When recommending places:
- Include the neighborhood/district
- Include best times to visit when you know them
- Suggest what to order/try
- Include a local tip or useful phrase in the local language
- If the user asks for family-friendly options, prioritize parks, kid-friendly restaurants, and safe neighborhoods

WHEN CREATING ITINERARIES (if user asks for "itinerary", "plan", "X days in [City]"):
You MUST respond in this EXACT markdown format with NO conversational intro:

# [City] Hidden Gems

**Day 1: [Theme]**

- **[Real Place Name] (Local Favorite)**: [Description with what to order/see, best time].
  Address: [Place name, District/Neighborhood, City]
- **[Real Place Name] (Hidden Gem)**: [Description with what to order/see, best time].
  Address: [Place name, District/Neighborhood, City]

**Day 2: [Theme]**

[Continue same format...]

**Local Tips**
- [Tip 1]
- [Tip 2]

IMPORTANT for itineraries:
- Start with markdown title: # [City] Hidden Gems
- Use ONLY real, verified place names
- ALWAYS include "Address: [Place name, District, City]" on a new line after each description — critical for mapping
- Address format: SHORT and geocode-friendly: "Place Name, District, City" (NO street numbers)
- Mark special spots as (Hidden Gem), (Local Favorite), or (Mixed)
- NO conversational intro like "Absolutely!" or "Here you go!"
${spotsContext}`;
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

        // Validate request body first (before incrementing usage)
        const validation = await validateBody(req, chatSchema);
        if (!validation.success) {
            return Errors.validationError(validation.error || "Invalid request");
        }

        const { messages, city: explicitCity } = validation.data;

        // Atomic check and increment - prevents race conditions
        const { allowed, usage } = await checkAndIncrementUsage(userId, "chat_messages");

        if (!allowed) {
            return Errors.limitExceeded(
                "chat messages",
                usage.currentUsage,
                usage.limit,
                usage.periodResetAt
            );
        }

        // Determine city context: explicit param > detected from messages
        const detectedCity = explicitCity || detectCityFromMessages(messages);

        // Fetch relevant spots from database if we know the city
        const latestUserMessage = messages.filter(m => m.role === "user").pop()?.content || "";
        const spotsContext = detectedCity
            ? await fetchRelevantSpots(detectedCity, latestUserMessage)
            : "";

        const systemPrompt = buildSystemPrompt(detectedCity, spotsContext);

        // Convert messages to Anthropic format (filter out system messages)
        const anthropicMessages = messages
            .filter(m => m.role === "user" || m.role === "assistant")
            .map(m => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            }));

        const client = getAnthropicClient();
        const response = await client.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 2048,
            system: systemPrompt,
            messages: anthropicMessages,
        });

        const reply = response.content[0].type === "text" ? response.content[0].text : "";

        return NextResponse.json({ message: reply });
    } catch (error) {
        return handleApiError(error, "[CHAT_ERROR]");
    }
}
