import { createClient } from '@supabase/supabase-js';

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
 * For user-specific operations, prefer createSupabaseServerClient() from lib/supabase-server.
 */
export const createSupabaseAdmin = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  return createClient(supabaseUrl, serviceRoleKey);
};

// For the server-authenticated client, import from lib/supabase-server instead:
// import { createSupabaseServerClient } from '@/lib/supabase-server';
