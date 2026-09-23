import "server-only";

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SignJWT } from 'jose';
import { currentUser } from '@/lib/auth/server';
import { withReadOnlyGuard } from '@/lib/supabase-read-only';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Mint the short-lived Supabase access token that Clerk's `supabase` JWT template
 * used to issue: HS256 with the project's JWT secret, `sub` = user id (the old
 * Clerk id for migrated users), `role`/`aud` = authenticated. RLS policies read
 * `auth.jwt() ->> 'sub'`, so they keep working unchanged.
 */
export async function mintSupabaseAccessToken(
  user: { id: string; email?: string | null },
  secret: string,
  ttlSeconds = 60,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: 'authenticated',
    email: user.email ?? undefined,
    app_metadata: {},
    user_metadata: {},
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(new TextEncoder().encode(secret));
}

/**
 * Create an authenticated Supabase client for server components/API routes.
 *
 * Uses a user token signed with SUPABASE_JWT_SECRET so RLS applies. Without the
 * secret (e.g. the preview Worker) or without a signed-in user it returns the
 * anon client, which is the same fallback the Clerk version had.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (secret) {
    try {
      const user = await currentUser();
      if (user) {
        const token = await mintSupabaseAccessToken({ id: user.id, email: user.primaryEmailAddress?.emailAddress }, secret);
        return createClient(supabaseUrl, supabaseAnonKey, withReadOnlyGuard({
          global: { headers: { Authorization: `Bearer ${token}` } }
        }));
      }
    } catch (error) {
      console.warn('[supabase-server] Failed to mint Supabase token:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  return createClient(supabaseUrl, supabaseAnonKey, withReadOnlyGuard({}));
}
