import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const REVISION_SYSTEM_PROMPT = `
You are an AI assistant helping users revise their travel itineraries.
Your job is to take an existing itinerary and user's revision requests, then output an updated itinerary.

CRITICAL: You must respond with valid JSON only. No markdown, no explanations, just pure JSON.

The JSON structure must be:
{
  "title": "Updated Itinerary Title",
  "dailyPlans": [
    {
      "day": 1,
      "theme": "Day theme",
      "activities": [
        {
          "name": "Activity name",
          "time": "09:00 AM",
          "duration": "2 hours",
          "description": "Activity description",
          "address": "Full address",
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
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06",
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
