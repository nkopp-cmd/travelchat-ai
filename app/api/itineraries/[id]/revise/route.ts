import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import OpenAI from "openai";
import { addThumbnailsToItinerary } from "@/lib/activity-images";
import { Errors, handleApiError } from "@/lib/api-errors";

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

CRITICAL RULES:
1. You MUST respond with valid JSON only. No markdown, no explanations, just pure JSON.
2. You MUST ALWAYS return the COMPLETE itinerary with ALL days - never return just the new/modified parts.
3. When adding a day, include ALL existing days PLUS the new day in your response.

ACTIVITY STRUCTURE RULES (VERY IMPORTANT):
1. Each activity MUST be a COMPLETE, REAL location (restaurant, cafe, attraction, shop, park, etc.)
2. The "name" field MUST be the actual business/place name (e.g., "Din Tai Fung", "Elephant Mountain", "Shilin Night Market")
3. NEVER use generic names like "Location", "What to Order", "Local Tip", "Breakfast", "Lunch", or "Dinner"
4. Include recommendations (what to order, what to see) INSIDE the "description" field
5. Each day MUST have 3-5 activities - NEVER return a day with 0 activities
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
1. ALWAYS return ALL days in dailyPlans - existing days + any new days
2. Keep what works from the original itinerary
3. Make the requested changes (add/remove/modify activities)
4. Maintain the local, authentic vibe
5. Ensure activities are realistic and well-timed
6. Keep the Localley score (local authenticity) high
7. Provide specific addresses and practical details
8. Every day MUST have at least 3 activities - never return empty days
`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Errors.unauthorized();
    }

    const { id } = await params;
    const { revisionRequest } = await req.json();

    if (!revisionRequest) {
      return Errors.validationError("Revision request is required");
    }

    const supabase = await createSupabaseServerClient();

    // Fetch existing itinerary
    const { data: itinerary, error: fetchError } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", id)
      .eq("clerk_user_id", userId)
      .single();

    if (fetchError || !itinerary) {
      return Errors.notFound("Itinerary");
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

IMPORTANT: Please revise this itinerary according to the user's request.
- You MUST return the COMPLETE itinerary with ALL days (existing + any new ones)
- Do NOT return just the new or modified parts - return EVERYTHING
- Each day MUST have 3-5 real activities with specific names and addresses
- If adding a new day, include Day 1, Day 2, etc. up to the new day

Make sure to:
1. Apply the requested changes
2. Keep activities that still work from the original
3. Maintain realistic timing and flow
4. Provide specific addresses for every activity
5. Keep the Localley score high (focus on hidden gems)
6. Return valid JSON in the exact format specified
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
      return Errors.externalServiceError("OpenAI");
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

      // Validate that each day has activities
      for (const day of revisedItinerary.dailyPlans) {
        if (!day.activities || !Array.isArray(day.activities) || day.activities.length === 0) {
          throw new Error(`Day ${day.day} has no activities`);
        }
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", rawContent);
      return Errors.externalServiceError("AI response parsing");
    }

    // Add thumbnail images to activities
    const dailyPlansWithImages = addThumbnailsToItinerary(
      revisedItinerary.dailyPlans,
      itinerary.city
    );
    revisedItinerary.dailyPlans = dailyPlansWithImages;

    // Calculate new days count from daily plans
    const newDaysCount = revisedItinerary.dailyPlans.length;

    // Update itinerary in database
    const { data: updatedItinerary, error: updateError } = await supabase
      .from("itineraries")
      .update({
        title: revisedItinerary.title || itinerary.title,
        activities: revisedItinerary.dailyPlans,
        days: newDaysCount,
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
      return Errors.databaseError();
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
    return handleApiError(error, "itinerary-revise");
  }
}
