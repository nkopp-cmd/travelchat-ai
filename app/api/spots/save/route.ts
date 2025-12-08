import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { spotId } = await req.json();

    if (!spotId) {
      return NextResponse.json({ error: "Spot ID is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

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
      return NextResponse.json({ error: "Failed to save spot" }, { status: 500 });
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
    console.error("Save spot error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { spotId } = await req.json();

    if (!spotId) {
      return NextResponse.json({ error: "Spot ID is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    const { error } = await supabase
      .from("saved_spots")
      .delete()
      .eq("clerk_user_id", userId)
      .eq("spot_id", spotId);

    if (error) {
      console.error("Error removing saved spot:", error);
      return NextResponse.json({ error: "Failed to remove spot" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      saved: false,
      message: "Spot removed from saved"
    });
  } catch (error) {
    console.error("Remove spot error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const spotId = searchParams.get("spotId");

    const supabase = createSupabaseAdmin();

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
      return NextResponse.json({ error: "Failed to fetch saved spots" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      spots: savedSpots
    });
  } catch (error) {
    console.error("Get saved spots error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
