/**
 * Early Adopter API
 *
 * GET - Get early adopter status for the current user
 * POST - Register current user as an early adopter (if slots available)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  getEarlyAdopterStatus,
  registerEarlyAdopter,
  isBetaMode,
} from "@/lib/early-adopters";

/**
 * Get early adopter status
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getEarlyAdopterStatus(userId);

    return NextResponse.json({
      success: true,
      isBetaMode: isBetaMode(),
      ...status,
    });
  } catch (error) {
    console.error("[early-adopter] Error:", error);
    return NextResponse.json(
      { error: "Failed to get early adopter status" },
      { status: 500 }
    );
  }
}

/**
 * Register as an early adopter
 */
export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user email from Clerk
    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress;

    const result = await registerEarlyAdopter(userId, email);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      position: result.position,
      message: result.message,
    });
  } catch (error) {
    console.error("[early-adopter] Error:", error);
    return NextResponse.json(
      { error: "Failed to register as early adopter" },
      { status: 500 }
    );
  }
}
