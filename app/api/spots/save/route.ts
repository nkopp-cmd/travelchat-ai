import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { checkUsageLimit, getUserTier } from "@/lib/usage-tracking";
import { TIER_CONFIGS } from "@/lib/subscription";
import { Errors, handleApiError } from "@/lib/api-errors";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Errors.unauthorized();
    }

    const { spotId } = await req.json();

    if (!spotId) {
      return Errors.validationError("Spot ID is required");
    }

    // Check saved spots limit
    const tier = await getUserTier(userId);
    const usage = await checkUsageLimit(userId, "spots_saved", tier);

    if (!usage.allowed) {
      return Errors.limitExceeded(
        "saved spots",
        usage.currentUsage,
        usage.limit,
        usage.periodResetAt
      );
    }

    const supabase = await createSupabaseServerClient();

    // Check if already saved
    const { data: existing } = await supabase
      .from("saved_spots")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("spot_id", spotId)
      .single();

    if (existing) {
      return NextResponse.json({
        success: true,
        saved: true,
        message: "Spot already saved"
      });
    }

    // Save the spot
    const { error } = await supabase
      .from("saved_spots")
      .insert({
        clerk_user_id: userId,
        spot_id: spotId,
      });

    if (error) {
      console.error("Error saving spot:", error);
      return Errors.databaseError();
    }

    // Award XP for discovering/saving a spot (fire and forget)
    try {
      await fetch(`${req.nextUrl.origin}/api/gamification/award`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': req.headers.get('cookie') || '',
        },
        body: JSON.stringify({
          action: 'discover_spot',
        }),
      });
    } catch (xpError) {
      console.error('Error awarding XP:', xpError);
    }

    return NextResponse.json({
      success: true,
      saved: true,
      message: "Spot saved successfully"
    });
  } catch (error) {
    return handleApiError(error, "spots-save");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Errors.unauthorized();
    }

    const { spotId } = await req.json();

    if (!spotId) {
      return Errors.validationError("Spot ID is required");
    }

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("saved_spots")
      .delete()
      .eq("clerk_user_id", userId)
      .eq("spot_id", spotId);

    if (error) {
      console.error("Error removing saved spot:", error);
      return Errors.databaseError();
    }

    return NextResponse.json({
      success: true,
      saved: false,
      message: "Spot removed from saved"
    });
  } catch (error) {
    return handleApiError(error, "spots-unsave");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Errors.unauthorized();
    }

    const { searchParams } = new URL(req.url);
    const spotId = searchParams.get("spotId");

    const supabase = await createSupabaseServerClient();

    // If spotId provided, check if specific spot is saved
    if (spotId) {
      const { data } = await supabase
        .from("saved_spots")
        .select("id")
        .eq("clerk_user_id", userId)
        .eq("spot_id", spotId)
        .single();

      return NextResponse.json({
        saved: !!data
      });
    }

    // Otherwise, return all saved spots
    const { data: savedSpots, error } = await supabase
      .from("saved_spots")
      .select(`
        id,
        spot_id,
        created_at,
        spots (
          id,
          name,
          description,
          category,
          localley_score,
          photos
        )
      `)
      .eq("clerk_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching saved spots:", error);
      return Errors.databaseError();
    }

    return NextResponse.json({
      success: true,
      spots: savedSpots
    });
  } catch (error) {
    return handleApiError(error, "spots-get-saved");
  }
}
