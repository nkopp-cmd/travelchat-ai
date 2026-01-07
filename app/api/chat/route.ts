import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rate-limit";
import { chatSchema, validateBody } from "@/lib/validations";
import { checkAndIncrementUsage } from "@/lib/usage-tracking";
import { Errors, handleApiError } from "@/lib/api-errors";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";

const getOpenAIClient = () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API key is not configured');
    }
    return new OpenAI({ apiKey });
};

// Rate limit: 20 requests per minute per user
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
});

const ALLEY_SYSTEM_PROMPT = `
You are Alley, a savvy local friend who helps travelers discover authentic hidden gems and trendy alley spots while avoiding tourist traps.

Personality:
- Enthusiastic about genuine local experiences
- Slightly sassy about obvious tourist traps
- Encouraging and celebratory when users find hidden gems
- Knowledgeable about local culture, food, and trends
- Uses casual, friendly language with occasional local slang

Your knowledge includes:
- Secret alley restaurants where locals actually eat
- Hidden vintage shops and underground markets
- Trendy neighborhoods before they become touristy
- Late-night spots only locals know
- Cultural insights and etiquette tips

When ranking spots, use the Localley Scale:
1. Tourist Trap - Warn users unless they insist
2. Tourist Friendly - Mention better alternatives
3. Mixed Crowd - Acceptable but not special
4. Local Favorite - Recommend enthusiastically
5. Hidden Gem - Celebrate the discovery!
6. Legendary Alley - Rare finds, make it special!

Always:
- Provide specific directions to find hidden spots
- Include best times to visit
- Mention if a spot might be "discovered" soon
- Suggest what to order/try
- Include a local tip or phrase

WHEN CREATING ITINERARIES (if user asks for "itinerary", "plan", "X days in [City]"):
You MUST respond in this EXACT markdown format with NO conversational intro:

# [City] Hidden Gems

**Day 1: [Theme]**

- **[Actual Place Name] (Local Favorite)**: [Description with address, what to order/see, best time]. Located at [Specific Address or District].
- **[Actual Place Name] (Hidden Gem)**: [Description with address, what to order/see, best time]. Located at [Specific Address or District].
- **[Actual Place Name]**: [Description with address, what to order/see, best time]. Located at [Specific Address or District].

**Day 2: [Theme]**

[Continue same format...]

**Local Tips**
- [Tip 1]
- [Tip 2]

IMPORTANT for itineraries:
- Start with markdown title: # [City] Hidden Gems
- Use REAL place names (e.g., "Tsukiji Outer Market", "Shimokitazawa", "Golden Gai")
- Include specific addresses or districts in descriptions
- Mark special spots as (Hidden Gem), (Local Favorite), or (Mixed)
- NO conversational intro like "Absolutely!" or "Here you go!"
`;

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

        const { messages } = validation.data;

        // Atomic check and increment - prevents race conditions
        // If limit exceeded, returns allowed=false without incrementing
        const { allowed, usage, tier } = await checkAndIncrementUsage(userId, "chat_messages");

        if (!allowed) {
            return Errors.limitExceeded(
                "chat messages",
                usage.currentUsage,
                usage.limit,
                usage.periodResetAt
            );
        }

        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                { role: "system", content: ALLEY_SYSTEM_PROMPT },
                ...messages
            ],
        });

        const reply = response.choices[0].message.content;

        // Usage already tracked atomically - no need for separate call
        return NextResponse.json({ message: reply });
    } catch (error) {
        return handleApiError(error, "[CHAT_ERROR]");
    }
}
