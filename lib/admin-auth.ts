/**
 * Centralized Admin Authorization Module
 *
 * Security requirements:
 * - No development mode bypass
 * - Env-based allowlist for admin users
 * - Structured logging for audit trail
 * - Always returns 403 for non-admins (even if authenticated)
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Parse admin user IDs from environment variable
// Format: comma-separated Clerk user IDs (e.g., "user_abc123,user_def456")
const ADMIN_USER_IDS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

export interface AdminAuthResult {
  authorized: boolean;
  userId: string | null;
  reason: "unauthenticated" | "not_admin" | "authorized";
}

/**
 * Check if a user has admin privileges.
 * NEVER bypasses in development - security is always enforced.
 */
export function isAdminUser(userId: string | null): boolean {
  if (!userId) return false;
  return ADMIN_USER_IDS.has(userId);
}

/**
 * Verify admin authorization for a request.
 * Returns structured result for flexibility in error handling.
 */
export async function verifyAdminAuth(): Promise<AdminAuthResult> {
  const { userId } = await auth();

  if (!userId) {
    return { authorized: false, userId: null, reason: "unauthenticated" };
  }

  if (!isAdminUser(userId)) {
    return { authorized: false, userId, reason: "not_admin" };
  }

  return { authorized: true, userId, reason: "authorized" };
}

/**
 * Log admin access attempt for audit trail.
 * Logs route and userId only - never logs request payloads.
 */
export function logAdminAccess(
  route: string,
  authResult: AdminAuthResult,
  action?: string
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    route,
    userId: authResult.userId || "anonymous",
    authorized: authResult.authorized,
    reason: authResult.reason,
    ...(action && { action }),
  };

  if (authResult.authorized) {
    console.log(`[ADMIN ACCESS] ${JSON.stringify(logEntry)}`);
  } else {
    console.warn(`[ADMIN ACCESS DENIED] ${JSON.stringify(logEntry)}`);
  }
}

/**
 * Require admin authorization for a route.
 * Returns NextResponse for unauthorized requests, or null if authorized.
 * Use this as a guard at the start of admin route handlers.
 */
export async function requireAdmin(
  route: string,
  action?: string
): Promise<{ response: NextResponse; userId: null } | { response: null; userId: string }> {
  const authResult = await verifyAdminAuth();
  logAdminAccess(route, authResult, action);

  if (!authResult.authorized) {
    const status = authResult.reason === "unauthenticated" ? 401 : 403;
    const error =
      authResult.reason === "unauthenticated" ? "Unauthorized" : "Forbidden";

    return {
      response: NextResponse.json({ error }, { status }),
      userId: null,
    };
  }

  return { response: null, userId: authResult.userId! };
}

/**
 * Check if admin list is configured.
 * Useful for startup validation.
 */
export function isAdminListConfigured(): boolean {
  return ADMIN_USER_IDS.size > 0;
}

/**
 * Get count of configured admins (for diagnostics, not the actual IDs).
 */
export function getAdminCount(): number {
  return ADMIN_USER_IDS.size;
}
