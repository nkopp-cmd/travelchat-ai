import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Errors, handleApiError } from "@/lib/api-errors";

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
      return Errors.unauthorized();
    }

    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    // Check if itinerary belongs to user
    const { data: itinerary, error: fetchError } = await supabase
      .from("itineraries")
      .select("id, shared, share_code, clerk_user_id")
      .eq("id", id)
      .single();

    if (fetchError || !itinerary) {
      return Errors.notFound("Itinerary");
    }

    // Verify ownership
    if (itinerary.clerk_user_id !== userId) {
      return Errors.forbidden("You don't have permission to share this itinerary.");
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
      return Errors.internalError("Failed to generate unique share code. Please try again.");
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
      return Errors.databaseError();
    }

    const shareUrl = `${req.nextUrl.origin}/shared/${shareCode}`;

    return NextResponse.json({
      success: true,
      shareCode,
      shareUrl,
    });
  } catch (error) {
    return handleApiError(error, "itinerary-share");
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
      return Errors.unauthorized();
    }

    const { id } = await params;
    const supabase = await createSupabaseServerClient();

    // Check if itinerary belongs to user
    const { data: itinerary, error: fetchError } = await supabase
      .from("itineraries")
      .select("clerk_user_id")
      .eq("id", id)
      .single();

    if (fetchError || !itinerary) {
      return Errors.notFound("Itinerary");
    }

    // Verify ownership
    if (itinerary.clerk_user_id !== userId) {
      return Errors.forbidden("You don't have permission to modify this itinerary.");
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
      return Errors.databaseError();
    }

    return NextResponse.json({
      success: true,
      message: "Sharing disabled",
    });
  } catch (error) {
    return handleApiError(error, "itinerary-unshare");
  }
}
