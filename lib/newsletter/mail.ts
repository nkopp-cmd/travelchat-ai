import "server-only";
import { render } from "@react-email/components";
import NewsletterConfirmEmail, { NEWSLETTER_CONFIRM_SUBJECT } from "@/emails/newsletter-confirm-email";
import { authMailMode, sendCloudflareMail, type AuthEmailBinding, type OutboxDatabase } from "@/lib/auth/mail";

/** Links always point at production in mail; preview only stores them in its outbox. */
export function newsletterSiteOrigin(): string {
  try {
    const url = new URL(process.env.BETTER_AUTH_URL ?? "");
    if (url.protocol === "https:") return url.origin;
  } catch { /* fall through */ }
  return "https://www.localley.io";
}

export const confirmUrl = (token: string) => `${newsletterSiteOrigin()}/newsletter/confirm?token=${token}`;
export const unsubscribeUrl = (token: string) => `${newsletterSiteOrigin()}/newsletter/unsubscribe?token=${token}`;

/**
 * The confirmation is transactional (the visitor just asked for it), so it uses the same Cloudflare Email binding as
 * sign-in links. Issues go out from a host script through Localley's Resend account (scripts/newsletter/send-issue.tsx).
 */
export async function sendNewsletterConfirm(to: string, token: string) {
  const url = confirmUrl(token);
  const env = (globalThis as Record<symbol, { env?: { AUTH_DB?: OutboxDatabase; AUTH_EMAIL?: AuthEmailBinding } } | undefined>)[
    Symbol.for("__cloudflare-context__")]?.env;
  if (authMailMode() === "outbox") {
    if (!env?.AUTH_DB) throw new Error("Auth outbox database is not configured");
    await env.AUTH_DB.prepare('insert into "auth_mail_outbox" ("kind", "email", "url", "createdAt") values (?, ?, ?, ?)')
      .bind("newsletter-confirm", to, url, Date.now()).run();
    return { sent: false, queued: true } as const;
  }
  const content = NewsletterConfirmEmail({ confirmUrl: url });
  const [html, text] = await Promise.all([render(content), render(content, { plainText: true })]);
  await sendCloudflareMail(env?.AUTH_EMAIL, { to, url, subject: NEWSLETTER_CONFIRM_SUBJECT, html, text });
  return { sent: true } as const;
}
