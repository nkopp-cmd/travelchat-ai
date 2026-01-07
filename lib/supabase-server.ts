import "server-only";

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
