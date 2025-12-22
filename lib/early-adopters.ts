/**
 * Early Adopter System
 *
 * Manages beta mode and early adopter benefits:
 * - Beta mode: All users get premium features for testing
 * - Early adopters: First 100 users get permanent premium
 *
 * Usage:
 * ```typescript
 * import { isEarlyAdopter, registerEarlyAdopter, isBetaMode } from '@/lib/early-adopters';
 *
 * // Check if beta mode is enabled (everyone gets premium)
 * const betaMode = isBetaMode();
 *
 * // Check if user is an early adopter
 * const earlyAdopter = await isEarlyAdopter(userId);
 *
 * // Register a new early adopter (if slots available)
 * const registered = await registerEarlyAdopter(userId);
 * ```
 */

import { createSupabaseAdmin } from '@/lib/supabase';

// Maximum number of early adopters
const MAX_EARLY_ADOPTERS = 100;

/**
 * Check if beta mode is enabled
 * When enabled, all users get premium features for testing
 */
export function isBetaMode(): boolean {
  return process.env.BETA_MODE === 'true';
}

/**
 * Get the effective tier for a user
 * Returns 'premium' if beta mode is on or user is an early adopter
 */
export async function getEffectiveTier(
  userId: string,
  actualTier: 'free' | 'pro' | 'premium'
): Promise<'free' | 'pro' | 'premium'> {
  // Beta mode - everyone gets premium
  if (isBetaMode()) {
    return 'premium';
  }

  // Check if user is an early adopter
  const earlyAdopter = await isEarlyAdopter(userId);
  if (earlyAdopter) {
    return 'premium';
  }

  // Return actual tier
  return actualTier;
}

/**
 * Check if a user is an early adopter
 */
export async function isEarlyAdopter(userId: string): Promise<boolean> {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from('early_adopters')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is expected for non-early-adopters
      console.error('[early-adopters] Error checking status:', error);
    }

    return !!data;
  } catch (error) {
    console.error('[early-adopters] Error:', error);
    return false;
  }
}

/**
 * Get the current count of early adopters
 */
export async function getEarlyAdopterCount(): Promise<number> {
  try {
    const supabase = createSupabaseAdmin();

    const { count, error } = await supabase
      .from('early_adopters')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[early-adopters] Error getting count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('[early-adopters] Error:', error);
    return 0;
  }
}

/**
 * Check if early adopter slots are available
 */
export async function hasEarlyAdopterSlots(): Promise<boolean> {
  const count = await getEarlyAdopterCount();
  return count < MAX_EARLY_ADOPTERS;
}

/**
 * Register a user as an early adopter
 * Returns true if successful, false if no slots or already registered
 */
export async function registerEarlyAdopter(
  userId: string,
  email?: string
): Promise<{ success: boolean; position?: number; message: string }> {
  try {
    const supabase = createSupabaseAdmin();

    // Check if already registered
    const existing = await isEarlyAdopter(userId);
    if (existing) {
      return { success: true, message: 'Already registered as early adopter' };
    }

    // Get current count
    const currentCount = await getEarlyAdopterCount();
    if (currentCount >= MAX_EARLY_ADOPTERS) {
      return { success: false, message: 'Early adopter slots are full' };
    }

    // Register the user
    const position = currentCount + 1;
    const { error } = await supabase.from('early_adopters').insert({
      clerk_user_id: userId,
      email: email || null,
      position,
      registered_at: new Date().toISOString(),
    });

    if (error) {
      // Handle race condition (duplicate)
      if (error.code === '23505') {
        return { success: true, message: 'Already registered as early adopter' };
      }
      console.error('[early-adopters] Error registering:', error);
      return { success: false, message: 'Failed to register' };
    }

    console.log(`[early-adopters] Registered user ${userId} as early adopter #${position}`);
    return {
      success: true,
      position,
      message: `Registered as early adopter #${position}!`,
    };
  } catch (error) {
    console.error('[early-adopters] Error:', error);
    return { success: false, message: 'Failed to register' };
  }
}

/**
 * Get early adopter status for a user
 */
export async function getEarlyAdopterStatus(userId: string): Promise<{
  isEarlyAdopter: boolean;
  position?: number;
  slotsRemaining: number;
  totalSlots: number;
}> {
  try {
    const supabase = createSupabaseAdmin();

    // Get user's early adopter record
    const { data: record } = await supabase
      .from('early_adopters')
      .select('position')
      .eq('clerk_user_id', userId)
      .single();

    // Get total count
    const count = await getEarlyAdopterCount();

    return {
      isEarlyAdopter: !!record,
      position: record?.position,
      slotsRemaining: Math.max(0, MAX_EARLY_ADOPTERS - count),
      totalSlots: MAX_EARLY_ADOPTERS,
    };
  } catch (error) {
    console.error('[early-adopters] Error:', error);
    return {
      isEarlyAdopter: false,
      slotsRemaining: 0,
      totalSlots: MAX_EARLY_ADOPTERS,
    };
  }
}

/**
 * List all early adopters (admin only)
 */
export async function listEarlyAdopters(): Promise<
  Array<{
    userId: string;
    email: string | null;
    position: number;
    registeredAt: string;
  }>
> {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from('early_adopters')
      .select('clerk_user_id, email, position, registered_at')
      .order('position', { ascending: true });

    if (error) {
      console.error('[early-adopters] Error listing:', error);
      return [];
    }

    return (data || []).map((row) => ({
      userId: row.clerk_user_id,
      email: row.email,
      position: row.position,
      registeredAt: row.registered_at,
    }));
  } catch (error) {
    console.error('[early-adopters] Error:', error);
    return [];
  }
}
