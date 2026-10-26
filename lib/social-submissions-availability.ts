import "server-only";
import { dataBackend } from "@/lib/app-data/backend";

/**
 * Social spot submissions run their media jobs through 11 Supabase RPCs that are not ported to D1
 * (DEFERRED_RPCS in __tests__/lib/d1-facade-coverage.test.ts). Production reads D1 since 2026-10-25, so the
 * feature is off there even though the build flag is "true"; port the RPCs, then drop the backend check.
 */
export function socialSpotSubmissionsAvailable(): boolean {
  return process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED === "true" && dataBackend() !== "d1";
}
