import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";

// Generate a unique share code
function generateShareCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const supabase = createSupabaseAdmin();

    // Check if itinerary belongs to user
    const { data: itinerary, error: fetchError } = await supabase
      .from("itineraries")
      .select("id, shared, share_code, clerk_user_id")
      .eq("id", id)
      .single();

    if (fetchError || !itinerary) {
      return NextResponse.json(
        { error: "Itinerary not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (itinerary.clerk_user_id !== userId) {
      return NextResponse.json(
        { error: "You don't have permission to share this itinerary" },
        { status: 403 }
      );
    }

    // If already shared, return existing share code
    if (itinerary.shared && itinerary.share_code) {
      const shareUrl = `${req.nextUrl.origin}/shared/${itinerary.share_code}`;
      return NextResponse.json({
        success: true,
        shareCode: itinerary.share_code,
        shareUrl,
      });
    }

    // Generate new share code
    let shareCode = generateShareCode();
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure uniqueness
    while (attempts < maxAttempts) {
      const { data: existing } = await supabase
        .from("itineraries")
        .select("id")
        .eq("share_code", shareCode)
        .single();

      if (!existing) break;

      shareCode = generateShareCode();
      attempts++;
    }

    if (attempts === maxAttempts) {
      return NextResponse.json(
        { error: "Failed to generate unique share code. Please try again." },
        { status: 500 }
      );
    }

    // Update itinerary with share code
    const { error: updateError } = await supabase
      .from("itineraries")
      .update({
        shared: true,
        share_code: shareCode,
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating itinerary:", updateError);
      return NextResponse.json(
        { error: "Failed to enable sharing" },
        { status: 500 }
      );
    }

    const shareUrl = `${req.nextUrl.origin}/shared/${shareCode}`;

    return NextResponse.json({
      success: true,
      shareCode,
      shareUrl,
    });
  } catch (error) {
    console.error("Error sharing itinerary:", error);
    return NextResponse.json(
      { error: "Failed to share itinerary" },
      { status: 500 }
    );
  }
}

// Unshare an itinerary
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const supabase = createSupabaseAdmin();

    // Check if itinerary belongs to user
    const { data: itinerary, error: fetchError } = await supabase
      .from("itineraries")
      .select("clerk_user_id")
      .eq("id", id)
      .single();

    if (fetchError || !itinerary) {
      return NextResponse.json(
        { error: "Itinerary not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (itinerary.clerk_user_id !== userId) {
      return NextResponse.json(
        { error: "You don't have permission to modify this itinerary" },
        { status: 403 }
      );
    }

    // Disable sharing
    const { error: updateError } = await supabase
      .from("itineraries")
      .update({
        shared: false,
        share_code: null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating itinerary:", updateError);
      return NextResponse.json(
        { error: "Failed to disable sharing" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Sharing disabled",
    });
  } catch (error) {
    console.error("Error unsharing itinerary:", error);
    return NextResponse.json(
      { error: "Failed to disable sharing" },
      { status: 500 }
    );
  }
}
