/**
 * Mirrors Better Auth users into the Supabase app tables. Replaces the Clerk
 * webhook (app/api/webhooks/clerk) that did the same on user.created / user.updated.
 *
 * No welcome email: CLERK_WEBHOOK_SECRET was never set in production, so the old
 * webhook never sent one. Adding it is a separate product decision.
 *
 * Runs from Better Auth database hooks. Failures are logged by the caller and
 * never block sign-up. On the preview Worker SUPABASE_READ_ONLY blocks the writes
 * and no service-role key exists, so this is a logged no-op there.
 */
import type { AuthUserRecord } from "./config";
import { createSupabaseAdmin } from "@/lib/supabase";
import { isSupabaseReadOnly } from "@/lib/supabase-read-only";

function displayName(user: AuthUserRecord): string | null {
  const parts = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return parts || user.name || null;
}

function syncEnabled(): boolean {
  return !isSupabaseReadOnly() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function syncAppUserCreated(user: AuthUserRecord): Promise<void> {
  if (!syncEnabled()) return;
  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();
  const { error: userError } = await supabase.from("users").upsert(
    {
      clerk_id: user.id,
      email: user.email,
      name: displayName(user),
      avatar_url: user.image ?? null,
      email_preferences: { marketing: true, weekly_digest: true, product_updates: true, itinerary_shared: true },
      created_at: now,
      updated_at: now,
    },
    { onConflict: "clerk_id" },
  );
  if (userError) throw new Error(`users upsert failed: ${userError.message}`);

  const { error: subError } = await supabase.from("subscriptions").upsert(
    { clerk_user_id: user.id, tier: "free", status: "active", created_at: now, updated_at: now },
    { onConflict: "clerk_user_id" },
  );
  if (subError) throw new Error(`subscriptions upsert failed: ${subError.message}`);
}

export async function syncAppUserUpdated(user: AuthUserRecord): Promise<void> {
  if (!syncEnabled()) return;
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({ email: user.email, name: displayName(user), avatar_url: user.image ?? null, updated_at: new Date().toISOString() })
    .eq("clerk_id", user.id);
  if (error) throw new Error(`users update failed: ${error.message}`);
}
