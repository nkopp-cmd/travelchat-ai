/**
 * Early Adopter System
 *
 * The original first-100 early adopter premium program has been retired.
 * Non-paid premium access is now limited to explicit lifetime-premium emails.
 *
 * Beta mode remains available as a global override for testing.
 */

/**
 * Check if beta mode is enabled
 * When enabled, all users get premium features for testing
 */
export function isBetaMode(): boolean {
  return process.env.BETA_MODE === 'true';
}

/**
 * Get the effective tier for a user
 * Returns 'premium' only when beta mode is on.
 */
export async function getEffectiveTier(
  _userId: string,
  actualTier: 'free' | 'pro' | 'premium'
): Promise<'free' | 'pro' | 'premium'> {
  // Beta mode - everyone gets premium
  if (isBetaMode()) {
    return 'premium';
  }

  // Return actual tier
  return actualTier;
}

export async function isEarlyAdopter(_userId: string): Promise<boolean> {
  return false;
}

export async function getEarlyAdopterCount(): Promise<number> {
  return 0;
}

export async function hasEarlyAdopterSlots(): Promise<boolean> {
  return false;
}

/**
 * Register a user as an early adopter
 * The program is closed, so this always returns a disabled message.
 */
export async function registerEarlyAdopter(
  _userId: string,
  _email?: string
): Promise<{ success: boolean; position?: number; message: string }> {
  return { success: false, message: 'Early adopter program is closed' };
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
  void userId;
  return {
    isEarlyAdopter: false,
    slotsRemaining: 0,
    totalSlots: 0,
  };
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
  return [];
}
