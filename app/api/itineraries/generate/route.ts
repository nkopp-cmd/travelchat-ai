import { OpenAI } from "openai";
import { NextRequest, NextResponse } from "next/server";
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { addThumbnailsToItinerary, addAIThumbnailsToItinerary } from '@/lib/activity-images';
import { hasFeature } from '@/lib/subscription';
import { generateItinerarySchema, validateBody } from '@/lib/validations';
import { checkAndTrackUsage, trackSuccessfulUsage } from '@/lib/usage-tracking';
import { TIER_CONFIGS } from '@/lib/subscription';

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";

const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey });
};

const SYSTEM_PROMPT = `
You are Alley, a savvy local travel guide who helps travelers discover authentic hidden gems and trendy alley spots while avoiding tourist traps.

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no explanations, no extra text. Just pure JSON.

Your personality:
- Enthusiastic about genuine local experiences
- Slightly sassy about obvious tourist traps
- Encouraging and celebratory when users find hidden gems
- Knowledgeable about local culture, food, and trends

ACTIVITY STRUCTURE RULES (VERY IMPORTANT):
1. Each activity MUST be a COMPLETE, REAL location (restaurant, cafe, attraction, shop, park, etc.)
2. The "name" field MUST be the actual business/place name (e.g., "Din Tai Fung", "Elephant Mountain", "Shilin Night Market")
3. NEVER use generic names like "Location", "What to Order", "Local Tip", "Breakfast", "Lunch", or "Dinner"
4. Include recommendations (what to order, what to see) INSIDE the "description" field
5. Keep activities to 3-5 per day maximum for a realistic, enjoyable pace
6. Each activity should be a distinct location - don't split one location into multiple activities

Generate detailed itineraries that emphasize:
- Hidden gems and local favorites over tourist traps
- Authentic experiences with specific spot names and addresses
- Why each place is special to locals
- Insider tips embedded in descriptions

You MUST return ONLY this valid JSON structure (no markdown formatting, no backticks, no extra text):
{
  "title": "string (SHORT 3-5 words, e.g., 'Seoul Hidden Gems', 'Tokyo Food Adventure', 'Taipei with Baby')",
  "subtitle": "string (brief tagline, e.g., 'Exploring secret alleys and local favorites')",
  "city": "string",
  "days": number,
  "localScore": number (1-10, how local vs touristy),
  "estimatedCost": "string (e.g., '$300-500')",
  "highlights": ["string", "string", "string"],
  "dailyPlans": [
    {
      "day": number,
      "theme": "string (e.g., 'Vintage Alleys & Coffee Culture')",
      "activities": [
        {
          "time": "string (e.g., '09:00 AM')",
          "type": "morning" | "afternoon" | "evening",
          "name": "string (REAL spot/business name - NEVER generic like 'Location' or 'Lunch')",
          "address": "string (full address with district/neighborhood)",
          "description": "string (why it's special + what to order/see/do + insider tips - all in one cohesive description)",
          "category": "string (one of: restaurant, cafe, bar, market, temple, park, museum, shopping, attraction, neighborhood)",
          "localleyScore": number (1-6),
          "duration": "string (e.g., '1-2 hours')",
          "cost": "string (e.g., '$10-20')"
        }
      ],
      "localTip": "string (insider tip for the day)",
      "transportTips": "string (how to get around)"
    }
  ]
}

TITLE RULES:
- Title must be SHORT (3-5 words max)
- Use the subtitle for longer descriptions
- Good titles: "Seoul Hidden Gems", "Tokyo Food Trail", "Taipei Family Adventure"
- Bad titles: "7 Days of Exploring Seoul's Hidden Alleyways and Secret Food Spots"

EXAMPLE of a GOOD activity:
{
  "time": "12:00 PM",
  "type": "afternoon",
  "name": "Yongkang Beef Noodle",
  "address": "No. 17, Lane 31, Section 2, Jinshan South Road, Da'an District, Taipei",
  "description": "This legendary shop has been serving Taiwan's best beef noodle soup since 1963. Order the half-spicy braised beef noodles - the broth is simmered for 48 hours. Go around 11:30 AM to beat the lunch rush. Baby-friendly with high chairs available.",
  "category": "restaurant",
  "localleyScore": 5,
  "duration": "1 hour",
  "cost": "$8-15"
}

EXAMPLE of a BAD activity (DO NOT DO THIS):
{
  "name": "Location",
  "description": "Yongkang Street"
}
`;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // Check usage limits before proceeding
    const { allowed, usage, tier } = await checkAndTrackUsage(userId, "itineraries_created");

    if (!allowed) {
      const tierConfig = TIER_CONFIGS[tier];
      return NextResponse.json(
        {
          error: "limit_exceeded",
          message: `You've reached your limit of ${usage.limit} itineraries this month.`,
          usage: {
            current: usage.currentUsage,
            limit: usage.limit,
            resetAt: usage.periodResetAt,
          },
          upgrade: tier === "free" ? {
            suggestion: "Upgrade to Pro for unlimited itineraries",
            tier: "pro",
            price: TIER_CONFIGS.pro.price,
          } : tier === "pro" ? {
            suggestion: "Upgrade to Premium for priority support",
            tier: "premium",
            price: TIER_CONFIGS.premium.price,
          } : null,
        },
        { status: 429 }
      );
    }

    const validation = await validateBody(req, generateItinerarySchema);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { city, days, interests, budget, localnessLevel, pace, groupType, templatePrompt } = validation.data;

    // Fetch spots from the city to include in recommendations
    const supabase = createSupabaseAdmin();
    const { data: spots } = await supabase
      .from('spots')
      .select('*')
      .ilike('address->>en', `%${city}%`)
      .gte('localley_score', localnessLevel || 3)
      .limit(15);

    const spotsContext = spots && spots.length > 0
      ? `\n\nHere are some verified local spots in ${city} that you SHOULD include:
${spots.map(spot => {
        const name = typeof spot.name === 'object' ? spot.name.en : spot.name;
        const desc = typeof spot.description === 'object' ? spot.description.en : spot.description;
        const addr = typeof spot.address === 'object' ? spot.address.en : spot.address;
        return `- ${name} (Score: ${spot.localley_score}/6, ${addr}): ${desc}`;
      }).join('\n')}`
      : '';

    const userPrompt = `
Create a ${days}-day itinerary for ${city} with these preferences:
- Interests: ${interests?.join(', ') || 'general exploration'}
- Budget: ${budget || 'moderate'}
- Localness Level: ${localnessLevel || 3}/5 (5 = maximum local authenticity)
- Pace: ${pace || 'moderate'}
- Group Type: ${groupType || 'solo'}
${spotsContext}

${templatePrompt ? `\nIMPORTANT: Follow this template style:\n${templatePrompt}` : ''}

Make it exciting, authentic, and full of hidden gems!
    `;

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 3000,
    });

    const rawContent = completion.choices[0].message.content || "{}";

    // Parse and validate the response
    let itineraryData;
    try {
      itineraryData = JSON.parse(rawContent);

      // Validate required fields
      if (!itineraryData.title || !itineraryData.dailyPlans || !Array.isArray(itineraryData.dailyPlans)) {
        throw new Error("Invalid itinerary structure from OpenAI");
      }

      // Validate that each day has activities
      for (const day of itineraryData.dailyPlans) {
        if (!day.activities || !Array.isArray(day.activities) || day.activities.length === 0) {
          throw new Error(`Day ${day.day} has no activities - please try again`);
        }
        // Validate each activity has required fields
        for (const activity of day.activities) {
          if (!activity.name || activity.name === "Location" || activity.name === "Breakfast" || activity.name === "Lunch" || activity.name === "Dinner") {
            throw new Error("Invalid activity name generated - please try again");
          }
        }
      }
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", rawContent);
      throw new Error("AI generated invalid response format. Please try again.");
    }

    // Add thumbnail images to activities
    // Use AI-generated images for Pro/Premium users, Unsplash for Free
    const useAIImages = hasFeature(tier, 'activityImages') === 'ai-generated';

    let dailyPlansWithImages;
    if (useAIImages) {
      // Pro/Premium: Generate AI thumbnails (max 6 to avoid long wait times)
      dailyPlansWithImages = await addAIThumbnailsToItinerary(
        itineraryData.dailyPlans,
        city,
        6 // Generate up to 6 AI images, rest use Unsplash
      );
    } else {
      // Free tier: Use Unsplash placeholders
      dailyPlansWithImages = addThumbnailsToItinerary(itineraryData.dailyPlans, city);
    }

    itineraryData.dailyPlans = dailyPlansWithImages;

    // Save itinerary to database
    // First, get or create the user in our users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_id', userId)
      .single();

    let userDbId = user?.id;

    // If user doesn't exist, create them
    if (userError || !user) {
      // Let Supabase generate the UUID automatically
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{
          clerk_id: userId
        }])
        .select('id')
        .single();

      if (createError) {
        console.error('Error creating user:', createError);
      } else {
        userDbId = newUser?.id;
      }
    }

    // Only try to save if we have a valid user ID
    let savedItinerary = null;
    if (userDbId) {
      const { data, error: saveError } = await supabase
        .from('itineraries')
        .insert([
          {
            user_id: userDbId,  // Required FK to users table
            clerk_user_id: userId,  // For direct querying
            title: itineraryData.title,
            subtitle: itineraryData.subtitle,
            city: city,
            days: days,
            activities: itineraryData.dailyPlans,
            local_score: itineraryData.localScore,
            shared: false,
            highlights: itineraryData.highlights,
            estimated_cost: itineraryData.estimatedCost,
          },
        ])
        .select()
        .single();

      if (saveError) {
        console.error('Error saving itinerary:', saveError);
        // Continue even if save fails - return the itinerary
      } else {
        savedItinerary = data;
      }
    } else {
      console.error('Cannot save itinerary: no user_id found');
    }

    // Track successful usage
    await trackSuccessfulUsage(userId, "itineraries_created");

    // Award XP for creating itinerary (fire and forget)
    try {
      await fetch(`${req.nextUrl.origin}/api/gamification/award`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': req.headers.get('cookie') || '',
        },
        body: JSON.stringify({
          action: 'create_itinerary',
        }),
      });
    } catch (xpError) {
      console.error('Error awarding XP:', xpError);
    }

    return NextResponse.json({
      success: true,
      itinerary: {
        id: savedItinerary?.id,
        ...itineraryData,
      },
    });
  } catch (error) {
    console.error("Error generating itinerary:", error);
    return NextResponse.json(
      { error: "Failed to generate itinerary. Please try again." },
      { status: 500 }
    );
  }
}
