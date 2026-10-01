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

function syncEnabled(): boolean {
  return !isSupabaseReadOnly() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function syncAppUserCreated(user: AuthUserRecord): Promise<void> {
  if (!syncEnabled()) return;
  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();
  const { error: userError } = await supabase.from("users").upsert(
    {
      // Production users.id has no default. Do not replace an existing app ID
      // or username when an auth hook repeats. Names and avatars live in Auth.
      id: crypto.randomUUID(),
      clerk_id: user.id,
      email: user.email,
      created_at: now,
    },
    { onConflict: "clerk_id", ignoreDuplicates: true },
  );
  if (userError) throw new Error(`users upsert failed: ${userError.message}`);

  const { error: subError } = await supabase.from("subscriptions").upsert(
    { clerk_user_id: user.id, tier: "free", status: "active", created_at: now, updated_at: now },
    { onConflict: "clerk_user_id", ignoreDuplicates: true },
  );
  if (subError) throw new Error(`subscriptions upsert failed: ${subError.message}`);
}

export async function syncAppUserUpdated(user: AuthUserRecord): Promise<void> {
  if (!syncEnabled()) return;
  // Verification/profile updates repair accounts made before this schema fix.
  // Duplicate inserts preserve existing IDs, profile fields and paid tiers.
  await syncAppUserCreated(user);
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({ email: user.email })
    .eq("clerk_id", user.id);
  if (error) throw new Error(`users update failed: ${error.message}`);
}
