import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Create a Supabase client with optional Clerk authentication.
 * Use this for client-side code where you can pass a Clerk token.
 */
export const createSupabaseClient = (clerkToken?: string) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  const options = clerkToken
    ? { global: { headers: { Authorization: `Bearer ${clerkToken}` } } }
    : {};

  return createClient(supabaseUrl, supabaseAnonKey, options);
};

/**
 * Create a Supabase admin client that bypasses RLS.
 *
 * Use ONLY when necessary:
 * - Admin/analytics routes that need cross-user access
 * - Webhook handlers with no user context
 * - Background jobs/cron tasks
 * - Public data endpoints (spots, challenges)
 *
 * For user-specific operations, prefer createSupabaseServerClient().
 */
export const createSupabaseAdmin = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  return createClient(supabaseUrl, serviceRoleKey);
};

/**
 * Create an authenticated Supabase client for server components/API routes.
 *
 * This client respects RLS policies and should be used for user-specific
 * data operations in server contexts.
 *
 * @returns Supabase client authenticated with the current user's Clerk token,
 *          or an unauthenticated client if no user is logged in.
 *
 * @example
 * ```ts
 * // In a server component or API route:
 * const supabase = await createSupabaseServerClient();
 * const { data } = await supabase.from('itineraries').select('*');
 * // Only returns itineraries belonging to the current user (via RLS)
 * ```
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  // Get the Clerk session token for Supabase
  const { getToken } = await auth();
  const token = await getToken({ template: 'supabase' });

  if (token) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
  }

  // Return unauthenticated client if no token
  return createClient(supabaseUrl, supabaseAnonKey);
}
