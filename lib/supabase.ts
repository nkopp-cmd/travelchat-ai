import { createClient } from '@supabase/supabase-js';
import { withReadOnlyGuard } from '@/lib/supabase-read-only';
import { withMigratedTables } from '@/lib/app-data/hybrid-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Create a Supabase client with optional Clerk authentication.
 * Use this for public reads or user-scoped requests where you can pass a Clerk token.
 */
export const createSupabaseClient = (clerkToken?: string) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  const options = clerkToken
    ? { global: { headers: { Authorization: `Bearer ${clerkToken}` } } }
    : {};

  // A caller-supplied token has no known user id here, so migrated tables are refused for it under D1.
  return withMigratedTables(createClient(supabaseUrl, supabaseAnonKey, withReadOnlyGuard(options)),
    clerkToken ? { role: 'user', userId: '' } : { role: 'anon' });
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

  return withMigratedTables(createClient(supabaseUrl, serviceRoleKey, withReadOnlyGuard({})), { role: 'service' });
};

// For the server-authenticated client, import from lib/supabase-server instead:
// import { createSupabaseServerClient } from '@/lib/supabase-server';
