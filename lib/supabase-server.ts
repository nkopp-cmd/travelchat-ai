import "server-only";

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Create an authenticated Supabase client for server components/API routes.
 *
 * This client attempts to use Clerk JWT template for RLS-based authentication.
 * If the JWT template is not configured, it falls back to an unauthenticated client.
 *
 * IMPORTANT: The 'supabase' JWT template must be configured in Clerk dashboard
 * for RLS policies to work correctly. Without it, this returns an anon client.
 *
 * @returns Supabase client authenticated with the current user's Clerk token,
 *          or an unauthenticated client if no user/token is available.
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

  try {
    // Get the Clerk session token for Supabase
    const { getToken } = await auth();
    const token = await getToken({ template: 'supabase' });

    if (token) {
      return createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
    }
  } catch (error) {
    // JWT template 'supabase' may not be configured in Clerk
    // Log warning but don't fail - fall through to anon client
    console.warn('[supabase-server] Failed to get Clerk JWT token:', error instanceof Error ? error.message : 'Unknown error');
  }

  // Return unauthenticated client if no token or on error
  return createClient(supabaseUrl, supabaseAnonKey);
}
