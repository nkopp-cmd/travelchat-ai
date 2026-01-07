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
import { Errors, handleApiError } from "@/lib/api-errors";

/**
 * Get early adopter status
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Errors.unauthorized();
    }

    const status = await getEarlyAdopterStatus(userId);

    return NextResponse.json({
      success: true,
      isBetaMode: isBetaMode(),
      ...status,
    });
  } catch (error) {
    return handleApiError(error, "early-adopter-get");
  }
}

/**
 * Register as an early adopter
 */
export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Errors.unauthorized();
    }

    // Get user email from Clerk
    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress;

    const result = await registerEarlyAdopter(userId, email);

    if (!result.success) {
      return Errors.validationError(result.message || "Registration failed");
    }

    return NextResponse.json({
      success: true,
      position: result.position,
      message: result.message,
    });
  } catch (error) {
    return handleApiError(error, "early-adopter-register");
  }
}
