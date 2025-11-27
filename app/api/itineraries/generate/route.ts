import { OpenAI } from "openai";
import { NextRequest, NextResponse } from "next/server";
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdmin } from '@/lib/supabase';

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

Generate detailed itineraries that emphasize:
- Hidden gems and local favorites
- Authentic experiences over tourist attractions
- Specific spot names with addresses
- Why each place is special
- Insider tips and local phrases

You MUST return ONLY this valid JSON structure (no markdown formatting, no backticks, no extra text):
{
  "title": "string (catchy, e.g., '3 Days of Seoul\\'s Secret Alleys')",
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
          "name": "string (spot name)",
          "address": "string",
          "description": "string (why it's special)",
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

    const { city, days, interests, budget, localnessLevel, pace, groupType, templatePrompt } = await req.json();

    // Validate input
    if (!city || !days || days < 1 || days > 7) {
      return NextResponse.json(
        { error: 'Invalid input. Days must be between 1 and 7.' },
        { status: 400 }
      );
    }

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
      model: "gpt-4o-2024-08-06",  // Explicit version with JSON mode support
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
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", rawContent);
      throw new Error("AI generated invalid response format. Please try again.");
    }

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
        console.error('❌ Error saving itinerary:', saveError);
        console.error('Save error details:', JSON.stringify(saveError, null, 2));
        // Continue even if save fails - return the itinerary
      } else {
        savedItinerary = data;
        console.log('✅ Itinerary saved successfully with ID:', savedItinerary?.id);
      }
    } else {
      console.error('❌ Cannot save itinerary: no user_id found');
    }

    // Award XP for creating itinerary (fire and forget)
    // Disabled for now - gamification endpoint needs proper implementation
    // try {
    //   await fetch(`${req.nextUrl.origin}/api/gamification/award`, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       action: 'create_itinerary',
    //     }),
    //   });
    // } catch (xpError) {
    //   console.error('Error awarding XP:', xpError);
    // }

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
