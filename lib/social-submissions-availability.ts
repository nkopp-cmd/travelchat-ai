import "server-only";

/**
 * Social spot submissions: the build flag alone decides. Their media-job functions run on both backends
 * (Supabase RPCs, or lib/app-data/d1-rpc-social.ts when DATA_BACKEND=d1).
 */
export function socialSpotSubmissionsAvailable(): boolean {
  return process.env.NEXT_PUBLIC_SOCIAL_SPOT_SUBMISSIONS_ENABLED === "true";
}
