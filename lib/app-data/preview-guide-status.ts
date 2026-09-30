import "server-only";
import type { NextRequest } from "next/server";
import { previewAdminGuides } from "./preview-admin-guides";
import { readPreviewGuideApplication } from "./preview-guide-application";

export function isPreviewGuideStatusCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

type GuideStatus = { isGuide: false } | {
  isGuide: true;
  status: string;
  onboardingComplete: boolean | null;
  chargesEnabled: boolean | null;
  payoutsEnabled: boolean | null;
  specialties: string[] | null;
  cities: string[] | null;
  totalEarned: number | string | null;
  pendingBalance: number | string | null;
  stripeStatus: null;
  appliedAt: string | null;
  approvedAt: string | null;
};

const boolOrNull = (value: unknown): value is boolean | null => value === null || typeof value === "boolean";
const textArrayOrNull = (value: unknown): value is string[] | null => value === null
  || Array.isArray(value) && value.every(item => typeof item === "string");
const amountOrNull = (value: unknown): value is number | string | null => value === null
  || typeof value === "number" && Number.isFinite(value)
  || typeof value === "string" && /^-?\d+(?:\.\d{1,2})?$/.test(value);
const dateOrNull = (value: unknown): value is string | null => value === null || typeof value === "string";

/** Current archive rows have no Stripe account; never call Stripe from this preview candidate. */
export async function previewGuideStatus(userId: string): Promise<GuideStatus> {
  if (!userId || userId.length > 256) throw new Error("Invalid guide owner");
  const guides = await previewAdminGuides(null);
  const guide = guides.find(row => row.clerk_user_id === userId);
  if (!guide) {
    const application = await readPreviewGuideApplication(userId);
    if (!application) return { isGuide: false };
    return { isGuide: true, status: "pending", onboardingComplete: false, chargesEnabled: false,
      payoutsEnabled: false, specialties: application.specialties, cities: application.cities,
      totalEarned: 0, pendingBalance: 0, stripeStatus: null, appliedAt: application.appliedAt,
      approvedAt: null };
  }
  if (guide.stripe_account_id !== null) throw new Error("Stripe-linked guide status unavailable");
  if (!boolOrNull(guide.stripe_onboarding_complete) || !boolOrNull(guide.stripe_charges_enabled)
    || !boolOrNull(guide.stripe_payouts_enabled) || !textArrayOrNull(guide.specialties)
    || !textArrayOrNull(guide.cities) || !amountOrNull(guide.total_earned)
    || !amountOrNull(guide.pending_balance) || !dateOrNull(guide.applied_at)
    || !dateOrNull(guide.approved_at)) throw new Error("Invalid guide status archive");
  return {
    isGuide: true,
    status: guide.status as string,
    onboardingComplete: guide.stripe_onboarding_complete,
    chargesEnabled: guide.stripe_charges_enabled,
    payoutsEnabled: guide.stripe_payouts_enabled,
    specialties: guide.specialties,
    cities: guide.cities,
    totalEarned: guide.total_earned,
    pendingBalance: guide.pending_balance,
    stripeStatus: null,
    appliedAt: guide.applied_at,
    approvedAt: guide.approved_at,
  };
}
