import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@clerk/nextjs/server";
import { rateLimit } from "@/lib/rate-limit";
import { chatSchema, validateBody } from "@/lib/validations";

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
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const validation = await validateBody(req, chatSchema);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        const { messages } = validation.data;

        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                { role: "system", content: ALLEY_SYSTEM_PROMPT },
                ...messages
            ],
        });

        const reply = response.choices[0].message.content;

        return NextResponse.json({ message: reply });
    } catch (error) {
        console.error("[CHAT_ERROR]", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
