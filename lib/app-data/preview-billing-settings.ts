import "server-only";
import { currentUser } from "@/lib/auth/server";
import { TIER_CONFIGS } from "@/lib/subscription";
import { newOwnerId, ownerIds } from "./preview-conversations";
import { previewBillingStatus } from "./preview-billing-status";

const statuses: Record<string, string> = {
  none: "No subscription", active: "Active", trialing: "Trial", past_due: "Past due",
  canceled: "Canceled", incomplete: "Incomplete", incomplete_expired: "Expired",
  paused: "Paused", beta: "Beta", lifetime_premium: "Lifetime premium", early_adopter: "Early adopter",
};
export interface PreviewBillingSettings {
  plan: string;
  status: string;
  periodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { label: string; used: number; limit: number; percent: number }[];
}
function displayDate(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new Error("Preview billing date unavailable");
  return new Date(value).toISOString().slice(0, 10);
}
/** Read-only settings for an exact verified fresh owner. Never infer historical ownership by email. */
export async function previewBillingSettings(userId: string): Promise<PreviewBillingSettings> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (user?.id !== userId || user.emailVerified !== true || !email || email.length > 200
    || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@preview\.localley\.test$/.test(email))
    throw new Error("Preview billing owner unavailable");
  const owners = await ownerIds(userId);
  if (owners.legacy || owners.fresh !== newOwnerId(userId))
    throw new Error("Preview billing owner unavailable");
  const billing = await previewBillingStatus(userId, email);
  if (!Object.hasOwn(statuses, billing.status) || !Object.hasOwn(TIER_CONFIGS, billing.tier))
    throw new Error("Preview billing state unavailable");
  const rows = [
    ["Trips this month", billing.usage.itinerariesThisMonth, billing.limits.itinerariesPerMonth],
    ["Chat messages today", billing.usage.chatMessagesToday, billing.limits.chatMessagesPerDay],
    ["Stories this week", billing.usage.storiesThisWeek, billing.limits.storiesPerWeek],
    ["AI images this month", billing.usage.aiImagesThisMonth, billing.limits.aiImagesPerMonth],
    ["Saved spots", billing.usage.savedSpots, billing.limits.savedSpotsLimit],
  ] as const;
  const usage = rows.map(([label, used, limit]) => {
    if (!Number.isSafeInteger(used) || used < 0 || !Number.isSafeInteger(limit) || limit < 0)
      throw new Error("Preview billing usage unavailable");
    return { label, used, limit, percent: limit ? Math.min(100, used / limit * 100) : used ? 100 : 0 };
  });
  return { plan: TIER_CONFIGS[billing.tier].name, status: statuses[billing.status],
    periodEnd: displayDate(billing.currentPeriodEnd), trialEnd: displayDate(billing.trialEnd),
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd, usage };
}
