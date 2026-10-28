import "server-only";
import { render } from "@react-email/components";
import SubscriptionEmail from "@/emails/subscription-email";
import { authMailMode, sendCloudflareMail, type AuthEmailBinding } from "@/lib/auth/mail";

export type SubscriptionMailEvent = "upgrade" | "cancelled";

interface AuthUserDatabase {
  prepare(query: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } };
}

const MANAGE_URL = "https://www.localley.io/settings";
const SUBJECTS: Record<SubscriptionMailEvent, (tier: string) => string> = {
  upgrade: (tier) => `Your Localley ${tier} plan is active`,
  cancelled: () => "Your Localley subscription is cancelled",
};

/**
 * Contract confirmations (Korea E-Commerce Act, EU §312k; NEEDS 902, APPROVALS.md 2026-10-27 23:55Z): upgrade and
 * cancellation only. Stripe sends receipts, failed-payment and renewal emails. The address is the verified account
 * email in AUTH_DB; marketing preferences do not apply to these. Preview stays silent.
 */
export async function sendSubscriptionMail(userId: string, event: SubscriptionMailEvent, tier?: string) {
  if (authMailMode() === "outbox") return { sent: false, reason: "preview_outbox" } as const;
  const env = (globalThis as Record<symbol, { env?: { AUTH_DB?: AuthUserDatabase; AUTH_EMAIL?: AuthEmailBinding } } | undefined>)[
    Symbol.for("__cloudflare-context__")]?.env;
  const user = await env?.AUTH_DB?.prepare(`SELECT email, name FROM "user" WHERE id = ? AND emailVerified = 1`)
    .bind(userId).first<{ email: string; name: string | null }>();
  if (!user?.email) return { sent: false, reason: "no_verified_email" } as const;
  const tierName = tier === "premium" ? "Premium" : tier === "pro" ? "Pro" : "Free";
  const content = SubscriptionEmail({ userName: user.name || undefined, eventType: event, newTier: tierName, manageUrl: MANAGE_URL });
  const [html, text] = await Promise.all([render(content), render(content, { plainText: true })]);
  const { messageId } = await sendCloudflareMail(env?.AUTH_EMAIL, { to: user.email, url: MANAGE_URL, subject: SUBJECTS[event](tierName), html, text });
  return { sent: true, emailId: messageId } as const;
}

/** A confirmation is due only on the state change, so renewals and Stripe retries send nothing. */
export function subscriptionMailEvent(previous: { tier?: string | null; status?: string | null } | null,
  next: { tier: string; status: string }): SubscriptionMailEvent | null {
  const paid = (status?: string | null) => status === "active" || status === "trialing";
  if (next.status === "canceled") return previous && previous.status !== "canceled" ? "cancelled" : null;
  if (!paid(next.status) || next.tier === "free") return null;
  return !previous || !paid(previous.status) || previous.tier !== next.tier ? "upgrade" : null;
}
