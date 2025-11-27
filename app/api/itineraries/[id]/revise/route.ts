import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import OpenAI from "openai";
import { addThumbnailsToItinerary } from "@/lib/activity-images";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";

const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey });
};

const REVISION_SYSTEM_PROMPT = `
You are an AI assistant helping users revise their travel itineraries.
Your job is to take an existing itinerary and user's revision requests, then output an updated itinerary.

CRITICAL: You must respond with valid JSON only. No markdown, no explanations, just pure JSON.

ACTIVITY STRUCTURE RULES (VERY IMPORTANT):
1. Each activity MUST be a COMPLETE, REAL location (restaurant, cafe, attraction, shop, park, etc.)
2. The "name" field MUST be the actual business/place name (e.g., "Din Tai Fung", "Elephant Mountain", "Shilin Night Market")
3. NEVER use generic names like "Location", "What to Order", "Local Tip", "Breakfast", "Lunch", or "Dinner"
4. Include recommendations (what to order, what to see) INSIDE the "description" field
5. Keep activities to 3-5 per day maximum for a realistic, enjoyable pace
6. Each activity should be a distinct location - don't split one location into multiple activities

The JSON structure must be:
{
  "title": "SHORT 3-5 word title (e.g., 'Seoul Hidden Gems', 'Taipei Family Trip')",
  "subtitle": "Brief tagline describing the trip",
  "dailyPlans": [
    {
      "day": 1,
      "theme": "Day theme",
      "activities": [
        {
          "name": "REAL spot/business name (e.g., 'Din Tai Fung' NOT 'Lunch' or 'Location')",
          "time": "09:00 AM",
          "duration": "2 hours",
          "description": "Why it's special + what to order/see/do + insider tips - all in one cohesive description",
          "address": "Full address with district/neighborhood",
          "category": "restaurant/cafe/bar/market/temple/park/museum/shopping/attraction/neighborhood",
          "cost": "€15-25",
          "type": "morning/afternoon/evening",
          "localleyScore": 5
        }
      ],
      "localTip": "Local insider tip",
      "transportTips": "How to get around"
    }
  ],
  "highlights": ["Highlight 1", "Highlight 2"],
  "localScore": 8,
  "estimatedCost": "€200-300 per person"
}

Guidelines:
1. Keep what works from the original itinerary
2. Make the requested changes (add/remove/modify activities)
3. Maintain the local, authentic vibe
4. Ensure activities are realistic and well-timed
5. Keep the Localley score (local authenticity) high
6. Provide specific addresses and practical details
`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { revisionRequest } = await req.json();

    if (!revisionRequest) {
      return NextResponse.json(
        { error: "Revision request is required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    // Fetch existing itinerary
    const { data: itinerary, error: fetchError } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .single();

    if (fetchError || !itinerary) {
      return NextResponse.json(
        { error: "Itinerary not found" },
        { status: 404 }
      );
    }

    // Parse existing activities
    const existingActivities =
      typeof itinerary.activities === "string"
        ? JSON.parse(itinerary.activities)
        : itinerary.activities;

    // Create revision prompt
    const userPrompt = `
Current Itinerary:
Title: ${itinerary.title}
City: ${itinerary.city}
Days: ${itinerary.days}
Current Activities: ${JSON.stringify(existingActivities, null, 2)}

User's Revision Request:
${revisionRequest}

Please revise this itinerary according to the user's request. Keep the same structure and maintain the local, authentic vibe. Make sure to:
1. Apply the requested changes
2. Keep activities that still work
3. Maintain realistic timing and flow
4. Provide specific addresses
5. Keep the Localley score high (focus on hidden gems)

Respond ONLY with valid JSON in the exact format specified.
`;

    // Call OpenAI to revise itinerary
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: REVISION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3000,
    });

    const rawContent = completion.choices[0].message.content;
    if (!rawContent) {
      throw new Error("No response from AI");
    }

    // Parse AI response
    let revisedItinerary;
    try {
      revisedItinerary = JSON.parse(rawContent);

      if (
        !revisedItinerary.dailyPlans ||
        !Array.isArray(revisedItinerary.dailyPlans)
      ) {
        throw new Error("Invalid itinerary structure");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", rawContent);
      throw new Error("AI generated invalid response. Please try again.");
    }

    // Add thumbnail images to activities
    const dailyPlansWithImages = addThumbnailsToItinerary(
      revisedItinerary.dailyPlans,
      itinerary.city
    );
    revisedItinerary.dailyPlans = dailyPlansWithImages;

    // Update itinerary in database
    const { data: updatedItinerary, error: updateError } = await supabase
      .from("itineraries")
      .update({
        title: revisedItinerary.title || itinerary.title,
        activities: revisedItinerary.dailyPlans,
        local_score: revisedItinerary.localScore || itinerary.local_score,
        highlights: revisedItinerary.highlights || itinerary.highlights,
        estimated_cost:
          revisedItinerary.estimatedCost || itinerary.estimated_cost,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating itinerary:", updateError);
      throw new Error("Failed to save revised itinerary");
    }

    return NextResponse.json({
      success: true,
      itinerary: {
        id: updatedItinerary.id,
        title: revisedItinerary.title,
        dailyPlans: revisedItinerary.dailyPlans,
        localScore: revisedItinerary.localScore,
        highlights: revisedItinerary.highlights,
        estimatedCost: revisedItinerary.estimatedCost,
      },
    });
  } catch (error) {
    console.error("Error revising itinerary:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to revise itinerary",
      },
      { status: 500 }
    );
  }
}
